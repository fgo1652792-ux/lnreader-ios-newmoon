// src/screens/WebviewScreen/pageTranslationController.ts
//
// RN-side controller for Page Translation (Zeus Ascent Edition:
// ZEUSNext/PageTranslation.swift, simplified). Sits between WebviewScreen's
// WebView and the translation engine in src/services/translation:
//
//   • page → RN : handleEvent({__moonTr: 1, kind: 'ready'|'collect'|'applied'|…})
//   • RN → page : the `inject` dep — the screen wires it to
//     webViewRef.injectJavaScript('window.__moonTrReceive(<literal>); true;')
//
// The controller owns epochs (tokens), per-engine collect caps, the session
// char guard, the translation memory (lazy SQLite init) and the batch loop;
// the page owns DOM selection, application and restoration. No React imports.

import { InteractionManager } from 'react-native';

import {
  TranslationFailure,
  TranslationMemory,
  AI_COLLECT_CAPS,
  autoEnabled,
  createSqliteMemoryDriver,
  detectLanguage,
  keepsTranslations,
  loadProviders,
  memoryIdentity,
  primarySubtag,
  providerById,
  readSecret,
  savePreferences,
  secretKey,
  translateSegments,
  type AIProviderConfiguration,
  type TranslationPreferences,
} from '@services/translation';

export interface PageCollectSegment {
  id: string;
  text: string;
}

type PageTranslationEventBase = { __moonTr: 1; documentID: string };

export type PageTranslationEvent =
  | (PageTranslationEventBase & { kind: 'ready-installed' })
  | (PageTranslationEventBase & { kind: 'ready'; lang: string; sample: string })
  | (PageTranslationEventBase & { kind: 'changed'; lang: string; sample: string })
  | (PageTranslationEventBase & { kind: 'viewport'; lang: string; sample: string })
  | (PageTranslationEventBase & {
      kind: 'collect';
      segments: PageCollectSegment[];
      tier: number;
      more: boolean;
      token?: number;
    })
  | (PageTranslationEventBase & {
      kind: 'applied';
      applied: number;
      ids: string[];
      token?: number;
    })
  | (PageTranslationEventBase & { kind: 'restored' });

export type PageTranslationCommand =
  | { kind: 'start'; language: string; token: number }
  | {
      kind: 'collect';
      maxCharacters: number;
      maxSegments: number;
      prioritize: boolean;
      token: number;
    }
  | { kind: 'apply'; items: { id: string; text: string }[]; expected: string; token: number }
  | { kind: 'restore' }
  | { kind: 'stop' };

export interface PageTranslationState {
  offered: boolean;
  running: boolean;
  translated: boolean;
  completed: number;
  sourceLanguage: string;
  error: string | null;
  reused: number;
}

export const INITIAL_PAGE_TRANSLATION_STATE: PageTranslationState = {
  offered: false,
  running: false,
  translated: false,
  completed: 0,
  sourceLanguage: '',
  error: null,
  reused: 0,
};

export interface PageTranslationControllerDeps {
  /** Screen-provided bridge: injects a command via injectJavaScript. */
  inject: (command: PageTranslationCommand) => void;
  /** Current page URL (live — read per round for the memory namespace). */
  url: () => string;
  prefs: () => TranslationPreferences;
  onState: (state: PageTranslationState) => void;
  translate?: typeof translateSegments;
  getSecret?: (key: string) => Promise<string>;
}

// Zeus PageTranslation per-engine collect caps (verbatim).
const PAGE_COLLECT_CAPS: Record<
  TranslationPreferences['engine'],
  { maxCharacters: number; maxSegments: number }
> = {
  googleWeb: { maxCharacters: 12000, maxSegments: 96 },
  googleCloud: { maxCharacters: 5000, maxSegments: 32 },
  ai: { maxCharacters: 10000, maxSegments: 64 },
  cloudflare: { maxCharacters: 10000, maxSegments: 64 },
  microsoftVisco: { maxCharacters: 10000, maxSegments: 64 },
};

const SESSION_CHAR_GUARD = 500000;
const SESSION_GUARD_MESSAGE =
  'حجم الترجمة في هذه الجلسة تجاوز الحد الآمن. اضغط متابعة لاستكمال بقية الصفحة.';
const GENERIC_FAILURE_MESSAGE = 'تعذر إكمال الترجمة. تحقق من الشبكة أو المزود.';

const hostOf = (url: string): string => {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  const authority = match?.[1] ?? '';
  return authority.split('@').pop()?.split(':')[0]?.toLowerCase() ?? '';
};

export class PageTranslationController {
  private readonly deps: PageTranslationControllerDeps;
  private disposed = false;
  private memoryPromise: Promise<TranslationMemory> | null = null;
  private state: PageTranslationState = { ...INITIAL_PAGE_TRANSLATION_STATE };

  /** Epoch ticket — bumped on start/restore/ready/navigation; stale page
   *  events (old token) and in-flight rounds are dropped by comparison. */
  private token = 0;
  /** True between start()/resume() and fail()/restore()/navigation. */
  private active = false;
  /** A collect round is being processed (memory/translate/apply). */
  private busy = false;
  /** Another round was requested while busy (drain `more` or DOM change). */
  private pending = false;
  private processedCharacters = 0;
  private lastPageUrl = '';

  constructor(deps: PageTranslationControllerDeps) {
    this.deps = deps;
  }

  // --------------------------------------------------------------- setup ---

  /** Screen unmounted (or WebView remounted) — every bridge touch is a no-op. */
  dispose(): void {
    this.disposed = true;
    this.active = false;
    this.busy = false;
    this.pending = false;
  }

  // -------------------------------------------------------- page events ---

  handleEvent = (event: PageTranslationEvent): void => {
    if (this.disposed) return;
    switch (event.kind) {
      case 'ready-installed':
        break;
      case 'ready':
        this.handleReady(event);
        break;
      case 'changed':
      case 'viewport':
        this.handleDynamic(event.kind);
        break;
      case 'collect':
        void this.processCollect(event);
        break;
      case 'applied':
        this.handleApplied(event);
        break;
      case 'restored':
        this.resetRun();
        break;
    }
  };

  // ------------------------------------------------------- user actions ---

  start = (): void => {
    if (this.state.running) return;
    const prefs = this.deps.prefs();
    this.token += 1;
    this.active = true;
    this.busy = false;
    this.pending = false;
    this.processedCharacters = 0;
    this.patch({
      offered: false,
      running: true,
      translated: false,
      completed: 0,
      reused: 0,
      error: null,
    });
    this.deps.inject({ kind: 'start', language: prefs.target, token: this.token });
    this.requestCollect(true);
  };

  restore = (): void => {
    this.token += 1;
    this.active = false;
    this.busy = false;
    this.pending = false;
    this.processedCharacters = 0;
    this.deps.inject({ kind: 'restore' });
    this.resetRun();
  };

  /** «متابعة» — one immediate re-collect after a failure; never a loop. */
  resume = (): void => {
    if (this.state.error === null) return;
    this.active = true;
    this.pending = false;
    this.processedCharacters = 0;
    this.patch({ error: null, running: true });
    this.requestCollect(true);
  };

  dismissOffer = (): void => {
    if (this.state.offered) this.patch({ offered: false });
  };

  excludeHost = (): void => {
    const prefs = this.deps.prefs();
    const host = hostOf(this.deps.url());
    if (host.length > 0 && !prefs.excludedHosts.includes(host)) {
      savePreferences({ ...prefs, excludedHosts: [...prefs.excludedHosts, host] });
    }
    this.dismissOffer();
  };

  /** Navigation updates: reset the epoch + run state for a new page. The
   *  memory namespace is recomputed from the URL on the next collect. */
  onNavigation = (url: string): void => {
    if (this.disposed) return;
    // Fragment-only jumps never reload the document — keep the live run.
    const pageUrl = url.split('#')[0];
    if (pageUrl === this.lastPageUrl) return;
    this.lastPageUrl = pageUrl;
    if (this.active) this.deps.inject({ kind: 'stop' });
    this.token += 1;
    this.active = false;
    this.busy = false;
    this.pending = false;
    this.processedCharacters = 0;
    this.patch({ ...INITIAL_PAGE_TRANSLATION_STATE });
  };

  // ---------------------------------------------------------- internals ---

  private handleReady(event: Extract<PageTranslationEvent, { kind: 'ready' }>): void {
    const prefs = this.deps.prefs();
    const language = detectLanguage(event.sample ?? '', event.lang || '');
    // A (re)loaded document invalidates every in-flight round of the last one.
    this.token += 1;
    this.active = false;
    this.busy = false;
    this.pending = false;
    this.processedCharacters = 0;
    const foreign =
      language.length > 0 &&
      primarySubtag(language) !== primarySubtag(prefs.target) &&
      !prefs.excludedHosts.includes(hostOf(this.deps.url()));
    // v3: automatic translation is INDEPENDENT of the suggestion chip —
    // autoEnabled('browser') honours the new master switch + scope and keeps
    // the legacy `automatic` key working. `suggest` only controls the offer.
    const auto = foreign && autoEnabled('browser', prefs);
    const offered = auto || (prefs.suggest && foreign);
    this.patch({
      offered,
      running: false,
      translated: false,
      completed: 0,
      reused: 0,
      error: null,
      sourceLanguage: language,
    });
    if (auto) this.start();
  }

  private handleDynamic(kind: 'changed' | 'viewport'): void {
    if (!this.active || !this.state.translated || this.state.error !== null) return;
    const prefs = this.deps.prefs();
    if (!prefs.dynamicContent && kind !== 'viewport') return;
    if (this.busy) {
      this.pending = true;
      return;
    }
    this.requestCollect(kind === 'viewport');
  }

  private handleApplied(event: Extract<PageTranslationEvent, { kind: 'applied' }>): void {
    if (typeof event.token === 'number' && event.token !== this.token) return;
    if (event.applied <= 0) return;
    this.patch({
      completed: this.state.completed + event.applied,
      translated: true,
    });
  }

  private requestCollect(prioritize: boolean): void {
    if (this.disposed) return;
    const prefs = this.deps.prefs();
    // v3: the AI engine collects the whole page per round (its coordinator
    // plans large parts); every other engine keeps its Zeus-verbatim caps.
    const caps =
      prefs.engine === 'ai'
        ? { maxCharacters: AI_COLLECT_CAPS.maxCharacters, maxSegments: AI_COLLECT_CAPS.maxSegments }
        : PAGE_COLLECT_CAPS[prefs.engine];
    this.deps.inject({
      kind: 'collect',
      maxCharacters: caps.maxCharacters,
      maxSegments: caps.maxSegments,
      prioritize,
      token: this.token,
    });
  }

  // One batch round: memory lookup → dedupe missing → translateSegments →
  // memory.save → inject apply. Chain (or consume `pending`) afterwards.
  private async processCollect(
    event: Extract<PageTranslationEvent, { kind: 'collect' }>,
  ): Promise<void> {
    if (!this.active) return;
    if (typeof event.token === 'number' && event.token !== this.token) return;
    if (this.busy) {
      this.pending = true;
      return;
    }
    this.busy = true;
    const ticket = this.token;
    let chain = false;
    try {
      const prefs = this.deps.prefs();
      const pageID = this.deps.url().split('#')[0];
      const provider = this.effectiveProvider();
      const namespace = memoryIdentity(pageID, prefs, provider);
      const segments = event.segments.filter(
        segment =>
          typeof segment.id === 'string' &&
          typeof segment.text === 'string' &&
          segment.text.trim().length > 0,
      );
      const results = new Map<string, string>();
      if (segments.length > 0) {
        const memory = await this.getMemory();
        const cached = await memory.lookup(namespace, segments.map(row => row.text));
        if (ticket !== this.token) return;
        this.patch({ reused: this.state.reused + cached.size });
        for (const [text, translated] of cached) results.set(text, translated);
        // Repeated lines are billed once per batch (Zeus dedupe rule).
        const missing = segments
          .filter(row => !cached.has(row.text))
          .filter(
            (row, index, all) => all.findIndex(other => other.text === row.text) === index,
          );
        const fresh = new Map<string, string>();
        if (missing.length > 0) {
          this.processedCharacters += missing.reduce(
            (sum, row) => sum + Array.from(row.text).length,
            0,
          );
          if (this.processedCharacters > SESSION_CHAR_GUARD) {
            throw new TranslationFailure(SESSION_GUARD_MESSAGE);
          }
          const secret = await (this.deps.getSecret ?? readSecret)(secretKey(prefs, provider));
          const translated = await (this.deps.translate ?? translateSegments)(
            missing.map(row => ({ id: row.id, text: row.text })),
            { prefs, provider, secret },
          );
          if (ticket !== this.token) return;
          for (const item of translated) {
            const source = missing.find(row => row.id === item.id);
            if (source) fresh.set(source.text, item.text);
          }
          if (keepsTranslations(prefs) && fresh.size > 0) {
            await memory.save(namespace, fresh);
          }
          for (const [text, translated] of fresh) results.set(text, translated);
        }
      }
      const items = segments.flatMap(row => {
        const text = results.get(row.text);
        return text === undefined ? [] : [{ id: row.id, text }];
      });
      if (items.length > 0) {
        this.deps.inject({ kind: 'apply', items, expected: event.documentID, token: ticket });
      }
      // Empty rounds must never chain — a stalled page would spin forever.
      chain = event.more === true && items.length > 0;
    } catch (error) {
      if (ticket === this.token) this.fail(error);
    } finally {
      this.busy = false;
      if (!this.active || this.state.error !== null) {
        this.pending = false;
        this.stopRun();
        return;
      }
      if (chain || this.pending) {
        // At most one queued follow-up round; let the UI breathe first
        // (Zeus Task.yield equivalent).
        this.pending = false;
        void InteractionManager.runAfterInteractions(() => {
          if (this.active && this.state.error === null && !this.busy) {
            this.requestCollect(false);
          }
        });
      } else {
        this.stopRun();
      }
    }
  }

  // Parity with ReaderTranslationCoordinator.effectiveProvider: glossary +
  // custom style ride on the AI instruction, and the memory namespace must
  // include the same fields so caches stay consistent per output identity.
  private effectiveProvider(): AIProviderConfiguration | null {
    const prefs = this.deps.prefs();
    const provider = providerById(loadProviders(), prefs.providerID);
    if (!provider || prefs.engine !== 'ai') return provider;
    const glossaryText =
      prefs.glossary.length > 0
        ? `Maintain this glossary strictly: ${prefs.glossary
            .slice(0, 200)
            .map(entry => `${entry.term} => ${entry.replacement}`)
            .join('; ')}`
        : '';
    const instruction = [provider.instruction, prefs.customInstruction, glossaryText]
      .filter(value => value && value.length > 0)
      .join('\n');
    return { ...provider, instruction };
  }

  private async getMemory(): Promise<TranslationMemory> {
    if (this.memoryPromise === null) {
      const memory = new TranslationMemory(createSqliteMemoryDriver());
      // Schema already present / transient open failure — lookups will
      // simply miss; never block translation on storage errors.
      this.memoryPromise = memory
        .initialize()
        .catch(() => undefined)
        .then(() => memory);
    }
    return this.memoryPromise;
  }

  private stopRun(): void {
    if (this.state.running) this.patch({ running: false });
  }

  private resetRun(): void {
    this.patch({
      offered: false,
      running: false,
      translated: false,
      completed: 0,
      reused: 0,
      error: null,
    });
  }

  private fail(error: unknown): void {
    const message =
      error instanceof TranslationFailure
        ? error.message
        : `${GENERIC_FAILURE_MESSAGE} (${(error as Error)?.message ?? 'خطأ غير معروف'})`;
    this.active = false;
    this.pending = false;
    this.patch({ running: false, error: message });
  }

  private patch(partial: Partial<PageTranslationState>): void {
    this.state = { ...this.state, ...partial };
    if (!this.disposed) this.deps.onState(this.state);
  }
}
