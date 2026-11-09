// Moon novels v3 — translated metadata layer (display-only).
//
// Novel titles, summaries, genres and chapter titles shown in browse/search/
// library/details screens can be translated to the target language WITHOUT
// touching the original strings in SQLite or plugin data. Translations are
// cached in the shared translation memory under metadata namespaces so they
// survive restarts and never re-bill for a known text.
//
// Rules (spec priority 1):
// - Titles render instantly in the original language, upgrade in place when
//   a translation arrives (per-item, no list reload, order never changes).
// - A whole screen of titles is aggregated into FEW provider requests
//   (debounced, serialized — no request storm while scrolling).
// - Arabic texts are never re-translated to Arabic.
// - Failures keep the original visible and back off (no tight retry loop).
// - Memory refs use `meta:{pluginId}:{path}` identities so the Data & Storage
//   screen can delete them per novel without touching original data.

import {
  isRTLLanguage,
  keepsTranslations,
  memoryIdentity,
  type TranslationSegment,
} from './types';
import { detectLanguage, primarySubtag } from './detect';
import {
  loadPreferences,
  loadProviders,
  providerById,
} from './prefs';
import { TranslationMemory } from './memory';
import { createSqliteMemoryDriver } from './memorySqlite';
import { translateSegments } from './textService';
import { readSecret } from './secrets';

export type MetadataKind = 'title' | 'summary' | 'genre' | 'chapterTitle';

export interface MetadataItem {
  kind: MetadataKind;
  pluginId: string;
  novelPath: string; // '' for shared/global items (genres)
  text: string;
}

export type MetadataListener = (updates: ReadonlyMap<string, string>) => void;

const DEBOUNCE_MS = 400;
const MAX_WAIT_MS = 1500;
const BATCH_CHAR_BUDGET = 18_000; // per flush, per namespace group
const MAX_BATCH_ITEMS = 96;
const FAILURE_COOLDOWN_MS = 30_000;
const MAX_QUEUED = 256;

const cache = new Map<string, string>(); // text -> translated (or same text)
const settled = new Set<string>(); // texts resolved this session (any outcome)
const failedAt = new Map<string, number>();
const listeners = new Set<MetadataListener>();
let queue: MetadataItem[] = [];
let queuedTexts = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let firstQueuedAt = 0;
let processing = false;
let memory: TranslationMemory | null = null;

export const subscribeMetadata = (listener: MetadataListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Synchronous snapshot for useSyncExternalStore — stable string or undefined.
export const translatedMetadata = (text: string): string | undefined =>
  cache.get(text);

const notify = (updates: ReadonlyMap<string, string>): void => {
  for (const listener of [...listeners]) {
    try {
      listener(updates);
    } catch {
      // A broken screen must never break the pipeline.
    }
  }
};

const ensureMemory = (): TranslationMemory | null => {
  if (memory) return memory;
  try {
    memory = new TranslationMemory(createSqliteMemoryDriver());
    memory.initialize();
    return memory;
  } catch {
    memory = null;
    return null;
  }
};

// ---- target-language guard -------------------------------------------------

const SCRIPT_RANGES: Record<string, (code: number) => boolean> = {
  ar: c => c >= 0x0600 && c <= 0x06ff,
  fa: c => c >= 0x0600 && c <= 0x06ff,
  ur: c => c >= 0x0600 && c <= 0x06ff,
  he: c => c >= 0x0590 && c <= 0x05ff,
  ru: c => c >= 0x0400 && c <= 0x04ff,
  ja: c => (c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff),
  zh: c => c >= 0x4e00 && c <= 0x9fff,
  ko: c => c >= 0xac00 && c <= 0xd7af,
};

const isLetter = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x0400 && code <= 0x04ff) ||
  (code >= 0x0600 && code <= 0x06ff) ||
  (code >= 0x0590 && code <= 0x05ff) ||
  (code >= 0x0900 && code <= 0x097f) ||
  (code >= 0x0e00 && code <= 0x0e7f) ||
  (code >= 0x3040 && code <= 0x30ff) ||
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0xac00 && code <= 0xd7af) ||
  (code >= 0x0370 && code <= 0x03ff);

// True when the text is already (mostly) written in the target language:
// no point translating Arabic titles to Arabic, and a Latin target with a
// clear same-script majority gets the same courtesy.
export const isAlreadyTargetLanguage = (text: string, target: string): boolean => {
  const primary = primarySubtag(target);
  let letters = 0;
  let scriptLetters = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (!isLetter(code)) continue;
    letters += 1;
    const test = SCRIPT_RANGES[primary];
    if (test && test(code)) scriptLetters += 1;
  }
  if (letters === 0) return true; // numbers/symbols only
  if (letters >= 25) {
    return detectLanguage(text).split('-')[0] === primary;
  }
  if (SCRIPT_RANGES[primary]) return scriptLetters / letters >= 0.6;
  // Latin targets: with no distinguishing script we cannot prove same-language
  // for short strings — treat as translatable (safe default).
  return false;
};

// ---- namespace helpers -----------------------------------------------------

const namespaceFor = (item: MetadataItem, prefs: ReturnType<typeof loadPreferences>) => {
  const pageID =
    item.kind === 'genre'
      ? 'metadata:genres'
      : `metadata:${item.pluginId}:${item.novelPath}`;
  const provider =
    prefs.engine === 'ai' ? providerById(loadProvidersSafe(), prefs.providerID) : null;
  return memoryIdentity(pageID, prefs, provider);
};

const loadProvidersSafe = () => {
  try {
    return loadProviders();
  } catch {
    return [];
  }
};

const refFor = (item: MetadataItem, engine: string, target: string) => ({
  novelId:
    item.kind === 'genre'
      ? 'meta:genres'
      : `meta:${item.pluginId}:${item.novelPath}`,
  chapterId: 'metadata',
  engine,
  target,
});

// ---- pipeline ---------------------------------------------------------------

export const queueMetadata = (items: MetadataItem[]): void => {
  if (items.length === 0) return;
  let accepted = 0;
  for (const item of items) {
    const text = item.text?.trim();
    if (!text) continue;
    if (settled.has(text) || queuedTexts.has(text)) continue;
    if (cache.has(text)) continue;
    const cooledAt = failedAt.get(text) ?? 0;
    if (Date.now() - cooledAt < FAILURE_COOLDOWN_MS) continue;
    if (queue.length >= MAX_QUEUED) break;
    queuedTexts.add(text);
    queue.push({ ...item, text });
    accepted += 1;
  }
  if (accepted === 0) return;
  const now = Date.now();
  if (firstQueuedAt === 0) firstQueuedAt = now;
  const elapsed = now - firstQueuedAt;
  const delay = elapsed >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
};

interface FlushGroup {
  namespace: string[];
  ref: ReturnType<typeof refFor>;
  items: MetadataItem[];
}

const flush = async (): Promise<void> => {
  if (processing) return;
  processing = true;
  try {
    const prefs = loadPreferences();
    const target = prefs.target;
    const batch = queue.splice(0, MAX_QUEUED);
    for (const item of batch) queuedTexts.delete(item.text);
    firstQueuedAt = 0;
    if (batch.length === 0) return;

    // 1. Same-language guard: never translate Arabic -> Arabic.
    const translatable: MetadataItem[] = [];
    const sameLanguage = new Map<string, string>();
    for (const item of batch) {
      if (isAlreadyTargetLanguage(item.text, target)) {
        sameLanguage.set(item.text, item.text);
      } else {
        translatable.push(item);
      }
    }
    if (sameLanguage.size > 0) {
      for (const [text, value] of sameLanguage) {
        cache.set(text, value);
        settled.add(text);
      }
      notify(sameLanguage);
    }
    if (translatable.length === 0) return;

    const activeMemory = ensureMemory();

    // 2. Memory pass: cached translations apply instantly, free.
    const groups = new Map<string, FlushGroup>();
    for (const item of translatable) {
      const identity = namespaceFor(item, prefs);
      const key = JSON.stringify(identity);
      let group = groups.get(key);
      if (!group) {
        group = {
          namespace: identity,
          ref: refFor(item, prefs.engine, target),
          items: [],
        };
        groups.set(key, group);
      }
      group.items.push(item);
    }
    if (activeMemory) {
      for (const group of groups.values()) {
        const capped = group.items.slice(0, MAX_BATCH_ITEMS);
        const overflow = group.items.slice(MAX_BATCH_ITEMS);
        group.items = capped;
        try {
          const cached = await activeMemory.lookup(
            group.namespace,
            capped.map(item => item.text),
          );
          if (cached.size > 0) {
            for (const [text, value] of cached) {
              cache.set(text, value);
              settled.add(text);
            }
            notify(cached);
          }
          group.items = group.items.filter(item => !cached.has(item.text));
        } catch {
          // Memory read failure must not block translation.
        }
        if (overflow.length > 0) {
          queue.unshift(...overflow);
          for (const item of overflow) queuedTexts.add(item.text);
        }
      }
    }

    // 3. Translate the misses — serialized, char-budgeted per flush.
    const secrets = new Map<string, string>();
    for (const group of groups.values()) {
      if (group.items.length === 0) continue;
      let used = 0;
      let take = 0;
      while (take < group.items.length && take < MAX_BATCH_ITEMS) {
        const length = Array.from(group.items[take].text).length;
        if (take > 0 && used + length > BATCH_CHAR_BUDGET) break;
        used += length;
        take += 1;
      }
      const chunk = group.items.slice(0, take);
      group.items = group.items.slice(take);
      if (group.items.length > 0) {
        queue.unshift(...group.items);
        for (const item of group.items) queuedTexts.add(item.text);
      }
      try {
        const secretKey =
          prefs.engine === 'googleCloud'
            ? 'google-cloud'
            : prefs.engine === 'cloudflare'
              ? 'cloudflare-workers-ai'
              : prefs.engine === 'ai'
                ? (providerById(loadProvidersSafe(), prefs.providerID)?.id ?? '')
                : '';
        if (!secrets.has(secretKey)) {
          secrets.set(secretKey, await readSecret(secretKey));
        }
        const segments: TranslationSegment[] = chunk.map((item, index) => ({
          id: `md${index}`,
          text: item.text,
        }));
        const translated = await translateSegments(segments, {
          prefs,
          provider:
            prefs.engine === 'ai' ? providerById(loadProvidersSafe(), prefs.providerID) : null,
          secret: secrets.get(secretKey) ?? '',
        });
        const updates = new Map<string, string>();
        translated.forEach(row => {
          const source = chunk[Number(row.id.replace('md', ''))];
          if (!source) return;
          const value = row.text.trim();
          if (value.length === 0) return;
          updates.set(source.text, value);
          cache.set(source.text, value);
          settled.add(source.text);
          failedAt.delete(source.text);
        });
        if (updates.size > 0) {
          if (activeMemory && keepsTranslations(prefs)) {
            try {
              await activeMemory.save(group.namespace, updates, group.ref);
            } catch {
              // Cache write failure is non-fatal.
            }
          }
          notify(updates);
        }
      } catch {
        // Keep originals visible; cool down so scrolling does not hot-loop.
        for (const item of chunk) {
          settled.delete(item.text);
          failedAt.set(item.text, Date.now());
        }
      }
    }
  } finally {
    processing = false;
    if (queue.length > 0 && timer === null) {
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, DEBOUNCE_MS);
    }
  }
};

// Re-translate support (novel page button): drop every local outcome for the
// text and queue it again. The memory cache still answers unless the memory
// entry itself was cleared from the Data & Storage screen.
export const forceMetadata = (item: MetadataItem): void => {
  const text = item.text?.trim();
  if (!text) return;
  cache.delete(text);
  settled.delete(text);
  failedAt.delete(text);
  queuedTexts.delete(text);
  queueMetadata([{ ...item, text }]);
};

// RTL helper for components rendering an Arabic summary/title.
export const metadataIsRTL = (text: string, target: string): boolean =>
  isRTLLanguage(target) || detectLanguage(text) === primarySubtag(target);

export const metadataPendingCount = (): number => queue.length;
