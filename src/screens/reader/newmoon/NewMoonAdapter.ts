// lnreader-ios/src/screens/reader/newmoon/NewMoonAdapter.ts
//
// Chapter-identity mapping + persistence glue between LNReader's database and
// the New-moon-2 engine's sequential chapter `number` (a.k.a. wNum).
//
// CORE RULE (no sequential-number assumptions): the shell's `number` is the
// 1-based POSITION INDEX of the chapter inside LNReader's canonical chapter
// order — the exact ordering the reader's own SQL uses everywhere:
//
//     ORDER BY CAST(page AS INTEGER) ASC, position ASC, id ASC
//
// (this is `getNextChapter`/`getPrevChapter`'s ordering and what the
// chapterNovelIdIndex(novelId, position, page, id) index backs). Every
// navigation decision is a neighbor lookup in that array — NEVER
// currentNumber ± 1 on the chapter's own numeric identity.
//
// The map is APPEND-ONLY: newly discovered chapters always sort after the
// existing ones (new chapters come from a higher source page), so the wNum of
// an existing chapter never changes. `syncChapters` verifies that and reports
// a reorder so the screen can rebuild + re-send `chapters`/`chapter`.

import { eq, asc } from 'drizzle-orm';
import type { ChapterInfo, NovelInfo } from '@database/types';
import { chapterSchema } from '@database/schema';
import { dbManager } from '@database/db';
import { castInt } from '@database/manager/manager';
import { getCustomPages, insertChapters } from '@database/queries/ChapterQueries';
import { fetchPage } from '@services/plugin/fetch';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  STRUCTURAL_KEYS,
} from '../../../reader/newmoon/sections';
import { ensureClassicMigration } from '../../../services/reader/migrateClassicReaderSettings';

export type WorReaderSettings = typeof DEFAULT_SETTINGS;

// ---------------------------------------------------------------------------
// Pure mapping helpers (unit-tested)
// ---------------------------------------------------------------------------

const toPageInt = (page: string | null | undefined): number => {
  const n = parseInt(String(page ?? '1'), 10);
  return Number.isFinite(n) ? n : 1;
};

/** Canonical LNReader reader order: page → position → id. */
export const compareChapterOrder = (
  a: Pick<ChapterInfo, 'id' | 'page' | 'position'>,
  b: Pick<ChapterInfo, 'id' | 'page' | 'position'>,
): number => {
  const pageDelta = toPageInt(a.page) - toPageInt(b.page);
  if (pageDelta !== 0) {
    return pageDelta;
  }
  const posDelta = (a.position ?? 0) - (b.position ?? 0);
  if (posDelta !== 0) {
    return posDelta;
  }
  return a.id - b.id;
};

export const sortChaptersInReaderOrder = <
  T extends Pick<ChapterInfo, 'id' | 'page' | 'position'>,
>(
  chapters: T[],
): T[] => [...chapters].sort(compareChapterOrder);

/**
 * wNum (1-based shell number) → chapter row. Pure: callers pass chapters
 * already sorted in reader order.
 */
export const buildWNumMap = <T extends { id: number }>(
  orderedChapters: T[],
): Map<number, T> => {
  const map = new Map<number, T>();
  orderedChapters.forEach((chapter, index) => {
    map.set(index + 1, chapter);
  });
  return map;
};

/** `{number,title}` payload for the shell's `chapters` message. */
export const shellChapterList = (
  orderedChapters: Pick<ChapterInfo, 'name'>[],
): { number: number; title: string }[] =>
  orderedChapters.map((chapter, index) => ({
    number: index + 1,
    title: chapter.name,
  }));

/** 1..100 progress percent of a position inside the ordered list. */
export const computePercent = (wNum: number, total: number): number => {
  if (!total || total <= 0 || !wNum || wNum <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((wNum / total) * 100));
};

/** Neighbor position with bounds; null when out of range. */
export const neighborWNum = (
  wNum: number,
  offset: number,
  total: number,
): number | null => {
  const next = wNum + offset;
  if (next < 1 || (total > 0 && next > total)) {
    return null;
  }
  return next;
};

// ---------------------------------------------------------------------------
// Ordered chapter loading (DB) + source-page extension ("load more")
// ---------------------------------------------------------------------------

/**
 * Chapters of a novel in canonical reader order. The DB is queried directly
 * (instead of ChapterQueries.getNovelChapters, whose `positionAsc` lacks the
 * page tiebreaker) so multi-page novels order exactly like
 * getNextChapter/getPrevChapter do. The default limit is deliberately huge:
 * the rows only carry name/page/position-sized data and the shell window-
 * renders the list itself.
 */
export const fetchReaderOrderChapters = async (
  novelId: number,
  offset = 0,
  limit = 20000,
): Promise<ChapterInfo[]> =>
  dbManager
    .select()
    .from(chapterSchema)
    .where(eq(chapterSchema.novelId, novelId))
    .orderBy(
      asc(castInt(chapterSchema.page)),
      asc(chapterSchema.position),
      asc(chapterSchema.id),
    )
    .limit(limit)
    .offset(offset)
    .all();

/**
 * Extends the chapter list from the SOURCE plugin — the same mechanism the
 * Novel screen uses when a page has no rows yet (fetchPage → insertChapters,
 * see bootstrapService.getChaptersForPage / useChapter.loadPageBoundaryChapter).
 * Returns the freshly inserted count (0 when nothing new exists).
 */
export const extendChaptersFromSource = async (
  novel: NovelInfo,
): Promise<number> => {
  const knownPages = getCustomPages(novel.id).map(c => c.page);
  const knownSet = new Set(knownPages);
  const totalPages = novel.totalPages ?? 0;
  const allPages =
    totalPages > 0
      ? Array.from({ length: totalPages }, (_, i) => String(i + 1))
      : [...knownSet];
  const nextPage = allPages.find(page => !knownSet.has(page));
  if (!nextPage) {
    return 0;
  }
  const sourcePage = await fetchPage(novel.pluginId, novel.path, nextPage);
  if (!sourcePage?.chapters?.length) {
    return 0;
  }
  await insertChapters(
    novel.id,
    sourcePage.chapters.map(ch => ({ ...ch, page: nextPage })),
  );
  return sourcePage.chapters.length;
};

// ---------------------------------------------------------------------------
// WOR settings / scroll persistence (MMKV)
// ---------------------------------------------------------------------------

export const WOR_SETTINGS_KEY = '@wor_reader_settings_v4';
export const WOR_SCROLL_PREFIX = '@wor_scroll_';
export const WOR_LAST_PREFIX = '@wor_last_';

export const scrollKeyFor = (novelId: number, chapterId: number): string =>
  `${WOR_SCROLL_PREFIX}${novelId}_${chapterId}`;
export const lastPosKeyFor = (novelId: number): string =>
  `${WOR_LAST_PREFIX}${novelId}`;

/**
 * DEFAULT_SETTINGS overlaid with the persisted patch (filtered to
 * SETTINGS_KEYS) — mirrors the engine's loadSettings().
 */
export const loadWorSettings = (): WorReaderSettings => {
  // [4-b] one-time classic→wor migration (guarded, best-effort; must run
  // before the read below so migrated values land in this load).
  ensureClassicMigration();
  const settings: WorReaderSettings = { ...DEFAULT_SETTINGS };
  try {
    const raw = MMKVStorage.getString(WOR_SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      SETTINGS_KEYS.forEach(key => {
        if (saved[key] !== undefined) {
          (settings as Record<string, unknown>)[key] = saved[key];
        }
      });
    }
  } catch {
    // corrupted payload → defaults
  }
  return settings;
};

/**
 * STRUCTURAL_KEYS change → the chapter HTML must be rebuilt (quote/mark
 * styles are baked into the section markup) while keeping the scroll
 * position. Compares the incoming patch against the CURRENT settings, so it
 * MUST be called before the patch is merged (the engine's WorReader.tsx
 * computes `needsRebuild` before applySettingsPatch for the same reason).
 */
export const needsStructuralRebuild = (
  patch: Record<string, unknown>,
  currentSettings: Record<string, unknown>,
): boolean =>
  STRUCTURAL_KEYS.some(
    key =>
      Object.prototype.hasOwnProperty.call(patch, key) &&
      String(patch[key] ?? '') !== String(currentSettings[key] ?? ''),
  );

/** Merge a patch into the stored settings (create-if-missing). */
export const saveWorSettingsPatch = (patch: Record<string, unknown>): void => {
  try {
    const raw = MMKVStorage.getString(WOR_SETTINGS_KEY);
    const existing = raw
      ? (JSON.parse(raw) as Record<string, unknown>)
      : {};
    MMKVStorage.set(
      WOR_SETTINGS_KEY,
      JSON.stringify({ ...existing, ...patch }),
    );
  } catch {
    // ignore — settings persistence is best-effort
  }
};

/** v2 per-chapter scroll payload (same shape the engine's reader stored). */
export const loadScrollOffset = (
  novelId: number,
  chapterId: number,
): number => {
  try {
    const raw = MMKVStorage.getString(scrollKeyFor(novelId, chapterId));
    if (!raw) {
      return 0;
    }
    const parsed = JSON.parse(raw) as { v?: number; offset?: number };
    if (parsed?.v !== 2) {
      return 0;
    }
    return parsed.offset ?? 0;
  } catch {
    return 0;
  }
};

export const saveScrollOffset = (
  novelId: number,
  chapterId: number,
  offset: number,
): void => {
  try {
    MMKVStorage.set(
      scrollKeyFor(novelId, chapterId),
      JSON.stringify({
        offset: Math.round(offset),
        global: 0,
        v: 2,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // ignore
  }
};

/**
 * `@wor_last_{novelId}` — the engine's "resume here" marker:
 * { chapterId, wNum, offset, savedAt } (chapter identity is the DB row id,
 * wNum is the positional shell number — never a derived number+1).
 */
export type WorLastPosition = {
  chapterId: number;
  wNum: number;
  offset: number;
  savedAt: number;
};

export const saveLastPosition = (
  novelId: number,
  chapterId: number,
  wNum: number,
  offset: number,
): void => {
  try {
    const payload: WorLastPosition = {
      chapterId,
      wNum,
      offset: Math.round(offset),
      savedAt: Date.now(),
    };
    MMKVStorage.set(lastPosKeyFor(novelId), JSON.stringify(payload));
  } catch {
    // ignore
  }
};

export const loadLastPosition = (novelId: number): WorLastPosition | null => {
  try {
    const raw = MMKVStorage.getString(lastPosKeyFor(novelId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<WorLastPosition>;
    if (
      typeof parsed.chapterId === 'number' &&
      typeof parsed.wNum === 'number' &&
      typeof parsed.offset === 'number'
    ) {
      return {
        chapterId: parsed.chapterId,
        wNum: parsed.wNum,
        offset: parsed.offset,
        savedAt: parsed.savedAt ?? 0,
      };
    }
    return null;
  } catch {
    return null;
  }
};

export const clearScrollFor = (novelId: number, chapterId: number): void => {
  try {
    MMKVStorage.remove(scrollKeyFor(novelId, chapterId));
  } catch {
    // ignore
  }
};
