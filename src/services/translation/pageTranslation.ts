// src/services/translation/pageTranslation.ts
//
// Port of ZEUSNext/PageTranslation.swift — the RN-side controller for
// translating whole web pages inside WebviewScreen.
//
// ADAPTATIONS (documented; core loop is 1:1):
//   • WKContentWorld / WKScriptMessageHandler → the react-native-webview
//     single postMessage channel with a { __moonTranslation: true } envelope;
//     the screen's dispatcher keeps the existing plugin-storage handler
//     intact (explicit requirement — never replace it).
//   • WKFrameInfo / multi-frame support → main frame only. Ad/widget iframes
//     are out of scope; their text is never touched (Zeus translated child
//     frames; the RN WebView cannot address frames individually).
//   • The streaming openAICompatible page path (translateOpenAIPage) is
//     intentionally NOT ported: SSE streaming belongs to the RN JS context,
//     not the page. AI providers run through the bounded batching path
//     (translateSegments), which keeps the 500 000-char round guard.
//   • callAsyncJavaScript → injectJavaScript('… Promise result via a
//     __moonTranslationResult envelope'), promise-based with a timeout.

import { WebView } from 'react-native-webview';
import {
  TranslationPreferences,
  TranslationSegment,
  keepsTranslations,
  secretKey,
} from './types';
import { translateSegments } from './segments';
import { TranslationMemory, memoryNamespace } from './memory';
import { composeInstruction, providerById } from './prefs';
import { readSecretAsync } from './secrets';
import { detectLanguage } from './detect';
import { endProviderContext } from './providerService';
import { uuid } from './uuid';

export type PageTranslationEvent =
  | { kind: 'ready'; sample: string; lang: string }
  | { kind: 'changed' }
  | { kind: 'viewport' };

export type PageTranslationState = {
  offered: boolean;
  running: boolean;
  translated: boolean;
  sourceLanguage: string;
  completed: number;
  error?: string;
  storageNotice?: string;
  reused: number;
};

const COLLECT_CHARS: Record<string, number> = {
  googleWeb: 12000,
  googleCloud: 5000,
};
const COLLECT_COUNT: Record<string, number> = {
  googleWeb: 96,
};

const INJECT_TIMEOUT_MS = 20_000;

/** Runs an async IIFE string in the page and resolves its posted result. */
const callPage = (
  webView: React.RefObject<WebView<object> | null>,
  source: string,
  signal: AbortSignal,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const ticket = uuid();
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('انتهت مهلة تنفيذ سكربت الترجمة في الصفحة.'));
    }, INJECT_TIMEOUT_MS);
    const handler = (payload: {
      __ticket?: string;
      __result?: unknown;
      __error?: string;
    }) => {
      if (payload.__ticket !== ticket) return;
      cleanup();
      if (payload.__error) reject(new Error(payload.__error));
      else resolve(payload.__result);
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      PageTranslation.pending.delete(ticket);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    PageTranslation.pending.set(ticket, handler);
    signal.addEventListener('abort', onAbort);
    webView.current?.injectJavaScript(
      `(async () => { try { const r = await (${source}); window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ __moonTranslationResult: true, __ticket: ${JSON.stringify(
        ticket,
      )}, __result: r === undefined ? null : r })); } catch (e) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ __moonTranslationResult: true, __ticket: ${JSON.stringify(
        ticket,
      )}, __error: String(e && e.message || e) })); } })(); true;`,
    );
  });

export class PageTranslation {
  /** Pending inject-result resolvers keyed by ticket. */
  static pending = new Map<
    string,
    (payload: {
      __ticket?: string;
      __result?: unknown;
      __error?: string;
    }) => void
  >();

  private webView: React.RefObject<WebView<object> | null>;
  private epoch = uuid();
  private context = uuid();
  private work: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private cache = new Map<string, string>();
  private cacheNamespace = '';
  private pending = false;
  private sessionPrefs: TranslationPreferences | null = null;
  private dismissed = false;
  private offered = false;
  private autoAttempted = false;
  private translated = false;
  private running = false;
  private completed = 0;
  private reused = 0;
  private error: string | undefined;
  private storageNotice: string | undefined;
  private sourceLanguage = '';
  private lastUrl = '';
  private prefs: TranslationPreferences;

  stateListener: ((state: PageTranslationState) => void) | null = null;

  constructor(
    webView: React.RefObject<WebView<object> | null>,
    prefs: TranslationPreferences,
  ) {
    this.webView = webView;
    this.prefs = prefs;
  }

  getSnapshot = (): PageTranslationState => ({
    offered: this.offered,
    running: this.running,
    translated: this.translated,
    sourceLanguage: this.sourceLanguage,
    completed: this.completed,
    error: this.error,
    storageNotice: this.storageNotice,
    reused: this.reused,
  });

  private emit(): void {
    this.stateListener?.(this.getSnapshot());
  }

  /** Navigation boundary — Zeus navigationStarted(). */
  navigationStarted(url: string): void {
    this.stop();
    this.translated = false;
    this.completed = 0;
    this.error = undefined;
    this.storageNotice = undefined;
    this.reused = 0;
    this.dismissed = false;
    this.offered = false;
    this.autoAttempted = false;
    this.sessionPrefs = null;
    this.pending = false;
    this.cache.clear();
    this.cacheNamespace = '';
    this.sourceLanguage = '';
    this.lastUrl = url;
    this.emit();
  }

  stop(): void {
    this.epoch = uuid();
    this.abort?.abort();
    this.abort = null;
    if (this.running) {
      this.running = false;
      this.emit();
    }
    endProviderContext(this.context);
    this.context = uuid();
    this.work = null;
  }

  pause(): void {
    this.stop();
    this.error = 'أُوقفت الترجمة. يمكنك المتابعة أو عرض الأصل.';
    this.emit();
  }

  dismiss(): void {
    this.dismissed = true;
    this.offered = false;
    this.emit();
  }

  /** Shell → RN messages already filtered by the screen dispatcher. */
  handleMessage(body: { kind?: string; sample?: string; lang?: string }): void {
    const kind = body.kind;
    if (kind === 'ready' || kind === 'changed' || kind === 'viewport') {
      if (kind === 'ready') {
        this.sourceLanguage = detectLanguage(
          body.sample ?? '',
          body.lang ?? '',
        );
        const target = this.prefs.target.split('-')[0].toLowerCase();
        const excluded = this.prefs.excludedHosts.some(host => {
          try {
            return new URL(this.lastUrl).hostname.endsWith(host.toLowerCase());
          } catch {
            return false;
          }
        });
        this.offered =
          !this.translated &&
          !this.running &&
          !this.dismissed &&
          !!this.sourceLanguage &&
          this.sourceLanguage !== target &&
          !excluded &&
          this.prefs.suggest;
        this.emit();
        if (this.offered && this.prefs.automatic && !this.autoAttempted) {
          void this.translate();
        }
      }
      if (
        (kind === 'viewport' ||
          ((kind === 'changed' || kind === 'ready') &&
            (this.sessionPrefs ?? this.prefs).dynamicContent)) &&
        this.translated &&
        !this.error
      ) {
        if (this.running) this.pending = true;
        else void this.translate(true);
      }
    }
  }

  translate = async (continuing = false): Promise<void> => {
    if (this.running) return;
    if (!continuing && this.translated) {
      this.emit();
      return;
    }
    const prefs = continuing ? this.sessionPrefs ?? this.prefs : this.prefs;
    this.sessionPrefs = prefs;
    const provider = providerById(prefs.providerID);
    const secret = await readSecretAsync(secretKey(prefs, provider));
    // Glossary composes into the AI provider identity (same as the reader).
    const effectiveProvider = provider
      ? {
          ...provider,
          instruction: composeInstruction(provider.instruction, undefined),
        }
      : null;
    const namespace = memoryNamespace(this.lastUrl, prefs, effectiveProvider);
    if (this.cacheNamespace !== namespace) {
      this.cache.clear();
      this.cacheNamespace = namespace;
    }
    const ticket = this.epoch;
    this.running = true;
    this.autoAttempted = true;
    this.offered = false;
    this.error = undefined;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.emit();

    const alive = (): void => {
      if (ticket !== this.epoch || signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
    };

    this.work = (async () => {
      try {
        let processedCharacters = 0;
        let appliedAnything = false;
        do {
          this.pending = false;
          alive();
          // start
          await callPage(
            this.webView,
            `moonTranslate.start(${JSON.stringify(prefs.target)})`,
            signal,
          );
          // collect (viewport-prioritized)
          const raw = (await callPage(
            this.webView,
            `moonTranslate.collect(${COLLECT_CHARS[prefs.engine] ?? 10000}, ${
              COLLECT_COUNT[prefs.engine] ?? 64
            }, true)`,
            signal,
          )) as {
            documentID?: string;
            segments?: { id: string; text: string }[];
          } | null;
          alive();
          if (!raw || typeof raw.documentID !== 'string') continue;
          const documentID = raw.documentID;
          const segments: TranslationSegment[] = (raw.segments ?? []).filter(
            s => typeof s?.id === 'string' && typeof s?.text === 'string',
          );
          if (!segments.length) continue;

          processedCharacters += segments.reduce(
            (sum, s) => sum + s.text.length,
            0,
          );
          if (processedCharacters >= 500_000) {
            throw new Error(
              'توقفت الدفعة بعد نص طويل جدًا لتقليل الاستهلاك. اضغط متابعة لإكمال بقية الصفحة.',
            );
          }

          // memory lookup
          if (keepsTranslations(prefs)) {
            const saved = await TranslationMemory.lookup(segments, namespace);
            alive();
            for (const [source, value] of saved) this.cache.set(source, value);
          }
          const cachedRows = segments.flatMap(s => {
            const value = this.cache.get(s.text);
            return value != null ? [{ id: s.id, text: value }] : [];
          });
          this.reused += cachedRows.length;
          // dedupe repeated headings/buttons — billed once
          const seen = new Set<string>();
          const missing = segments.filter(
            s =>
              !this.cache.has(s.text) &&
              s.text.trim().length > 0 &&
              !seen.has(s.text) &&
              seen.add(s.text),
          );
          let results = cachedRows;
          if (missing.length) {
            const fresh = await translateSegments(missing, {
              preferences: prefs,
              provider: effectiveProvider,
              secret,
              signal,
            });
            alive();
            const byID = new Map(fresh.map(v => [v.id, v.text]));
            const savedMap: Record<string, string> = {};
            for (const item of missing) {
              const value = byID.get(item.id);
              if (value != null) {
                savedMap[item.text] = value;
                this.cache.set(item.text, value);
              }
            }
            if (keepsTranslations(prefs)) {
              const ok = await TranslationMemory.save(savedMap, namespace);
              if (!ok) {
                this.storageNotice =
                  'تعذّر حفظ الترجمة على الجهاز. قد تحتاج مساحة متاحة؛ ستبقى نتيجة هذه الجلسة في الذاكرة.';
              }
            }
            alive();
            results = segments.flatMap(s => {
              const value = this.cache.get(s.text);
              return value != null ? [{ id: s.id, text: value }] : [];
            });
          }
          // apply
          const applied = (await callPage(
            this.webView,
            `moonTranslate.apply(${JSON.stringify(results)}, ${JSON.stringify(
              documentID,
            )})`,
            signal,
          )) as number | null;
          alive();
          if (applied && applied > 0) {
            this.completed += applied;
            this.translated = true;
            appliedAnything = true;
            this.emit();
          }
          // bound the in-memory cache on long-lived pages
          if (this.cache.size > 8000) this.cache.clear();
          if (this.pending) await new Promise(r => setTimeout(r, 0));
        } while (this.pending);
        if (!this.translated && !appliedAnything) {
          this.error = 'لم تُعثر على نصوص قابلة للترجمة في الصفحة الحالية.';
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (ticket === this.epoch) {
          this.error = e instanceof Error ? e.message : String(e);
        }
      } finally {
        if (ticket === this.epoch) {
          this.running = false;
          this.abort = null;
          this.work = null;
          this.emit();
        }
      }
    })();
    await this.work;
  };

  resume = (): Promise<void> => this.translate(true);

  restore = async (): Promise<void> => {
    this.stop();
    try {
      await callPage(
        this.webView,
        'moonTranslate.restore()',
        new AbortController().signal,
      );
    } catch {
      // the page may have navigated — nothing to restore
    }
    this.translated = false;
    this.completed = 0;
    this.error = undefined;
    this.dismissed = true;
    this.cache.clear();
    this.sessionPrefs = null;
    this.emit();
  };
}
