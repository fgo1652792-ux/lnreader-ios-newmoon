// src/services/translation/chapterEngine.ts
//
// Port of ZEUSNext/ReaderTranslation.swift — the per-chapter translation
// orchestrator, adapted for the New Moon reader bridge.
//
// VERBATIM SEMANTICS:
//   • context epoch rejects stale work after cancel/chapter switch
//   • priority loop: visible-first batches (24 000 chars / 256 items),
//     background batches (10 000 chars / 64 items), 500 000 chars per round
//   • memory lookup → dedupe identical texts → provider call → memory save
//   • results published ONLY after real text reaches the screen callback
//   • streaming path (openAICompatible) publishes partial batches
//   • cancel() ends the AI provider context (Zeus AIProviderService.end)
//
// ADAPTATIONS:
//   • SwiftUI rectangles → shell-reported visible paragraph window
//     ({from,to} paragraph indices, throttled by the shell itself)
//   • Zeus's in-memory `cache` map → the same map, plus TranslationMemory
//     persistence keyed by namespace (novel identity + engine + provider)
//   • glossary/style instructions are composed per novel and become part of
//     the provider identity, so they invalidate the memory namespace exactly
//     like Zeus's provider.instruction did.

import {
  AIProviderConfiguration,
  TranslationFailure,
  TranslationPreferences,
  TranslationSegment,
  keepsTranslations,
  secretKey,
} from './types';
import { translateSegments } from './segments';
import { translateOpenAIStreaming } from './providers/openAIStreaming';
import { TranslationMemory, memoryNamespace } from './memory';
import { ChapterSegments } from './chapterSegments';
import { composeInstruction, providerById } from './prefs';
import { readSecretAsync } from './secrets';
import { endProviderContext } from './providerService';
import { uuid } from './uuid';

export type ChapterTranslationTarget = {
  novelId: number;
  chapterId: number;
  pluginId: string;
  novelName: string;
  chapterName: string;
  /** Positional shell number (wNum) owning the document. */
  wNum: number;
  prepared: ChapterSegments;
};

export type ChapterEngineEvents = {
  /** Real paragraphs reached the reader DOM. */
  onApplied?: (applied: { id: string; text: string }[]) => void;
  /** Throttled progress snapshot for the translation card. */
  onProgress?: (state: {
    completed: number;
    total: number;
    reused: number;
    running: boolean;
    error?: string;
  }) => void;
  onError?: (message: string) => void;
  onDone?: (completed: number, reused: number) => void;
};

const VISIBLE_CHAR_LIMIT = 24_000;
const VISIBLE_ITEM_LIMIT = 256;
const BACKGROUND_CHAR_LIMIT = 10_000;
const BACKGROUND_ITEM_LIMIT = 64;
const ROUND_CHAR_LIMIT = 500_000;

type Priority = { tier: number; distance: number; index: number };
void (0 as unknown as Priority);

export class ChapterTranslationEngine {
  private task: Promise<void> | null = null;
  private context = uuid();
  private results = new Map<string, string>();
  private cache = new Map<string, string>();
  private cacheNamespace = '';
  private visible: { from: number; to: number } | null = null;
  private running = false;
  private reused = 0;
  private error: string | undefined;
  private target: ChapterTranslationTarget | null = null;
  private events: ChapterEngineEvents = {};
  private prefs: TranslationPreferences | null = null;
  private provider: AIProviderConfiguration | null = null;
  private secret = '';
  private abort: AbortController | null = null;

  // ------------------------------------------------------------- state ---

  get isRunning(): boolean {
    return this.running;
  }

  /** Chapter the current results belong to (snapshot guards). */
  get currentChapterId(): number | null {
    return this.target?.chapterId ?? null;
  }

  get translatedCount(): number {
    return this.results.size;
  }

  get totalCount(): number {
    return this.target?.prepared.segments.length ?? 0;
  }

  /** Live result snapshot for re-apply after document recovery. */
  snapshot(): { id: string; text: string }[] {
    return Array.from(this.results.entries()).map(([id, text]) => ({
      id,
      text,
    }));
  }

  // ------------------------------------------------------------- input ---

  /** Shell-reported visible window (paragraph indices, inclusive). */
  setVisibleWindow(from: number, to: number): void {
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      this.visible = { from, to };
    }
  }

  // ----------------------------------------------------------- startup ---

  async start(
    target: ChapterTranslationTarget,
    prefs: TranslationPreferences,
    events: ChapterEngineEvents = {},
    continuePrevious = false,
  ): Promise<void> {
    if (this.running && continuePrevious) return;
    if (!continuePrevious || this.target?.chapterId !== target.chapterId) {
      this.cancel();
      this.results.clear();
      this.reused = 0;
      this.error = undefined;
    }
    this.target = target;
    this.events = events;
    this.prefs = prefs;
    const configuredProvider = providerById(prefs.providerID);
    // Glossary + style compose into the provider identity → namespace.
    if (configuredProvider) {
      this.provider = {
        ...configuredProvider,
        instruction: composeInstruction(
          configuredProvider.instruction,
          target.novelId,
        ),
      };
    } else {
      this.provider = null;
    }
    this.secret = await readSecretAsync(secretKey(prefs, this.provider));
    const identity = `moonnovel:${target.pluginId}:${target.novelId}`;
    const namespace = memoryNamespace(identity, prefs, this.provider);
    if (namespace !== this.cacheNamespace) {
      this.cache.clear();
      this.cacheNamespace = namespace;
    }
    const id = this.context;
    this.running = true;
    this.error = undefined;
    this.abort = new AbortController();
    this.emitProgress();
    const existing = this.task ?? Promise.resolve();
    this.task = existing
      .catch(() => undefined)
      .then(() => this.run(id, namespace));
    await this.task;
  }

  // ---------------------------------------------------------------- run ---

  private async run(context: string, namespace: string): Promise<void> {
    const target = this.target;
    const prefs = this.prefs;
    if (!target || !prefs) return;
    const abort = this.abort;
    const checkAlive = (): void => {
      if (context !== this.context || abort?.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
    };

    try {
      const originals = target.prepared.segments;
      // Memory prefill for the whole chapter (Zeus lookup before first batch).
      if (keepsTranslations(prefs)) {
        const saved = await TranslationMemory.lookup(originals, namespace);
        if (saved.size) this.cache.clear();
        for (const [source, value] of saved) this.cache.set(source, value);
        for (const segment of originals) {
          const cached = this.cache.get(segment.text);
          if (cached != null && !this.results.has(segment.id)) {
            this.results.set(segment.id, cached);
            this.reused += 1;
          }
        }
        if (this.results.size) {
          this.events.onApplied?.(this.snapshot());
        }
        checkAlive();
      }

      const streaming =
        prefs.engine === 'ai' &&
        this.provider?.kind === 'openAICompatible' &&
        !!this.provider.model;

      let processedChars = 0;

      const applyAndPublish = async (
        rows: TranslationSegment[],
        final: boolean,
      ): Promise<void> => {
        for (const row of rows) this.results.set(row.id, row.text);
        if (rows.length) this.events.onApplied?.(rows);
        this.emitProgress();
        if (final) checkAlive();
      };

      const persist = async (
        sources: Map<string, string>,
        values: TranslationSegment[],
      ): Promise<void> => {
        if (!keepsTranslations(prefs)) return;
        const saved: Record<string, string> = {};
        for (const value of values) {
          const source = sources.get(value.id);
          if (source != null) {
            saved[source] = value.text;
            this.cache.set(source, value.text);
          }
        }
        const ok = await TranslationMemory.save(saved, namespace);
        if (!ok) {
          this.error =
            'تعذّر حفظ الترجمة على الجهاز. تحقق من المساحة المتاحة؛ الترجمة الحالية في الذاكرة.';
        }
      };

      const sourcesByID = new Map(originals.map(s => [s.id, s.text]));

      if (streaming && this.provider) {
        // Zeus translateOpenAIArticle: empty paragraphs pass through as-is;
        // cached text is reused; only unique uncached texts get streamed.
        const missing = originals.filter(
          s => s.text.trim().length > 0 && !this.cache.has(s.text),
        );
        const missingUnique: TranslationSegment[] = [];
        const seen = new Set<string>();
        for (const item of missing) {
          if (seen.has(item.text)) continue;
          seen.add(item.text);
          missingUnique.push(item);
        }
        // Zeus: empty segments and cached segments are already "done".
        for (const segment of originals) {
          if (!segment.text.trim().length) {
            this.results.set(segment.id, segment.text);
          } else {
            const cached = this.cache.get(segment.text);
            if (cached != null && !this.results.has(segment.id)) {
              this.results.set(segment.id, cached);
              this.reused += 1;
            }
          }
        }
        if (this.results.size) this.events.onApplied?.(this.snapshot());
        await translateOpenAIStreaming(
          missingUnique,
          prefs.target,
          this.provider,
          this.secret,
          this.abort!.signal,
          async rows => {
            checkAlive();
            await applyAndPublish(rows, false);
          },
        );
        checkAlive();
        // Final values come through the stream's last update; persist them.
        const finalRows = originals.flatMap(o => {
          const value = this.results.get(o.id);
          return value != null ? [{ id: o.id, text: value }] : [];
        });
        await persist(sourcesByID, finalRows);
        await TranslationMemory.recordChapter({
          novelId: target.novelId,
          chapterId: target.chapterId,
          namespace,
          segments: originals.length,
          bytes: finalRows.reduce((sum, r) => sum + r.text.length + 256, 0),
        });
        this.emitProgress();
        this.events.onDone?.(this.results.size, this.reused);
        return;
      }

      // Priority loop (Zeus ReaderTranslation.translate while-loop).
      while (this.results.size < originals.length) {
        checkAlive();
        const missingIndexes: number[] = [];
        originals.forEach((segment, index) => {
          if (!this.results.has(segment.id)) missingIndexes.push(index);
        });
        if (!missingIndexes.length) break;
        missingIndexes.sort(
          (a, b) =>
            this.priority(originals[a], a) - this.priority(originals[b], b),
        );
        const firstPriority = this.priority(
          originals[missingIndexes[0]],
          missingIndexes[0],
        );
        const visibleRun = firstPriority < 10_000; // tier 0 encoded as <10000
        const charLimit = visibleRun
          ? VISIBLE_CHAR_LIMIT
          : BACKGROUND_CHAR_LIMIT;
        const itemLimit = visibleRun
          ? VISIBLE_ITEM_LIMIT
          : BACKGROUND_ITEM_LIMIT;

        const batch: TranslationSegment[] = [];
        let size = 0;
        for (const index of missingIndexes) {
          const segment = originals[index];
          const tier = this.priority(segment, index);
          if (visibleRun && tier >= 10_000) break;
          if (
            batch.length &&
            (size + segment.text.length > charLimit ||
              batch.length >= itemLimit)
          ) {
            break;
          }
          batch.push(segment);
          size += segment.text.length;
        }
        if (!batch.length) break;

        processedChars += size;
        if (processedChars >= ROUND_CHAR_LIMIT) {
          throw new TranslationFailure(
            'توقفت الجولة عند حد النص الطويل لتقليل الاستهلاك. يمكنك المتابعة.',
          );
        }

        // Memory reuse + dedupe (repeated headings are billed once).
        const cachedRows: TranslationSegment[] = [];
        const missingUnique: TranslationSegment[] = [];
        const seen = new Set<string>();
        for (const segment of batch) {
          const cached = this.cache.get(segment.text);
          if (cached != null) {
            cachedRows.push({ id: segment.id, text: cached });
            continue;
          }
          if (seen.has(segment.text)) continue;
          seen.add(segment.text);
          missingUnique.push(segment);
        }
        if (cachedRows.length) {
          await applyAndPublish(cachedRows, true);
          this.reused += cachedRows.length;
        }
        checkAlive();

        if (missingUnique.length) {
          const values = await translateSegments(missingUnique, {
            preferences: prefs,
            provider: this.provider,
            secret: this.secret,
            signal: this.abort!.signal,
          });
          checkAlive();
          await persist(
            new Map(missingUnique.map(s => [s.id, s.text])),
            values,
          );
          checkAlive();
          // Apply from cache so repeated sources render identically.
          const rows: TranslationSegment[] = [];
          for (const segment of missingUnique) {
            const value = this.cache.get(segment.text);
            if (value != null) rows.push({ id: segment.id, text: value });
          }
          await applyAndPublish(rows, true);
        }
      }

      await TranslationMemory.recordChapter({
        novelId: target.novelId,
        chapterId: target.chapterId,
        namespace,
        segments: originals.length,
        bytes: originals.reduce((sum, s) => {
          const value = this.results.get(s.id);
          return sum + (value ? value.length + 256 : 0);
        }, 0),
      });
      this.emitProgress();
      this.events.onDone?.(this.results.size, this.reused);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (context !== this.context) return;
      const message =
        e instanceof TranslationFailure
          ? e.message
          : e instanceof Error
          ? e.message
          : String(e);
      this.error = message;
      this.events.onError?.(message);
      this.emitProgress();
    } finally {
      if (context === this.context) {
        this.running = false;
        this.abort = null;
        this.emitProgress();
      }
    }
  }

  /**
   * Zeus priority() — visible paragraphs first, then near-viewport, then far.
   * Title (p0) is always tier 0. Tier-0 encodes as index (<10000) so the
   * visible-run check stays a single comparison.
   */
  private priority(segment: TranslationSegment, index: number): number {
    if (segment.id === 'p0' || !this.visible) {
      // No window yet: opening paragraphs lead (Zeus: index < 6 → tier 0).
      return index <= 6 ? index : 20_000 + index;
    }
    const { from, to } = this.visible;
    if (index >= from && index <= to) return index;
    const distance = index < from ? from - index : index - to;
    if (distance <= Math.max(6, (to - from) * 2)) return 10_000 + distance;
    return 20_000 + index;
  }

  // -------------------------------------------------------------- stop ---

  cancel(): void {
    this.context = uuid(); // invalidate stale work
    this.abort?.abort();
    this.abort = null;
    if (this.running) {
      this.running = false;
      this.emitProgress();
    }
    if (this.prefs) endProviderContext(this.context);
    this.task = null;
  }

  /** Zeus restore() — forget results; the shell restores original text. */
  reset(): void {
    this.cancel();
    this.results.clear();
    this.reused = 0;
    this.error = undefined;
  }

  /** Continue an interrupted/failed run without re-translating what's shown. */
  resume(): Promise<void> {
    if (!this.target || !this.prefs) return Promise.resolve();
    return this.start(this.target, this.prefs, this.events, true);
  }

  private emitProgress(): void {
    this.events.onProgress?.({
      completed: this.results.size,
      total: this.totalCount,
      reused: this.reused,
      running: this.running,
      error: this.error,
    });
  }
}

/** Singleton per reader session (one chapter document at a time). */
export const chapterTranslationEngine = new ChapterTranslationEngine();
