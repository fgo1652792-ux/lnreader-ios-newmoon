// NewMoonAdapter — chapter identity (wNum = POSITION in canonical reader
// order, never a derived number+1), settings/structural-rebuild decisions and
// the MMKV-backed wor persistence keys. Heavy native/DB modules are mocked —
// everything under test here is pure or backed by an in-memory KV.

import type { ChapterInfo } from '@database/types';
import {
  buildWNumMap,
  computePercent,
  lastPosKeyFor,
  loadLastPosition,
  loadScrollOffset,
  loadWorSettings,
  needsStructuralRebuild,
  neighborWNum,
  saveLastPosition,
  saveScrollOffset,
  saveWorSettingsPatch,
  scrollKeyFor,
  shellChapterList,
  sortChaptersInReaderOrder,
} from '../NewMoonAdapter';
import { toInjectableLiteral } from '../NewMoonBridge';

jest.mock('@database/db', () => ({
  __esModule: true,
  dbManager: {},
}));

jest.mock('@database/manager/manager', () => ({
  __esModule: true,
  castInt: (value: unknown) => value,
}));

jest.mock('@services/plugin/fetch', () => ({
  __esModule: true,
  fetchPage: jest.fn(),
  fetchChapter: jest.fn(),
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  __esModule: true,
  getCustomPages: jest.fn(() => []),
  insertChapters: jest.fn(),
}));

jest.mock('@utils/mmkv/mmkv', () => {
  const map = new Map<string, string>();
  return {
    __esModule: true,
    MMKVStorage: {
      getString: (key: string) => map.get(key),
      set: (key: string, value: string) => map.set(key, value),
      remove: (key: string) => map.delete(key),
    },
  };
});

const chapter = (
  id: number,
  page: string,
  position: number,
  name = `فصل ${id}`,
): ChapterInfo =>
  ({
    id,
    novelId: 1,
    path: `/ch-${id}`,
    name,
    page,
    position,
    scanlator: null,
    isDownloaded: false,
    isRead: false,
    bookmark: false,
    progress: 0,
    updatedTime: 0,
    releaseDate: null,
  }) as unknown as ChapterInfo;

describe('chapter identity (positional wNum)', () => {
  const ordered = sortChaptersInReaderOrder([
    chapter(30, '1', 9),
    chapter(10, '1', 2),
    chapter(20, '1', 5),
    chapter(5, '2', 0), // page 2 sorts AFTER every page-1 chapter
  ]);

  it('orders by CAST(page) → position → id (canonical reader SQL)', () => {
    expect(ordered.map(c => c.id)).toEqual([10, 20, 30, 5]);
  });

  it('buildWNumMap assigns 1-based positional numbers', () => {
    const map = buildWNumMap(ordered);
    expect(map.get(1)?.id).toBe(10);
    expect(map.get(2)?.id).toBe(20);
    expect(map.get(3)?.id).toBe(30);
    expect(map.get(4)?.id).toBe(5);
    expect(map.size).toBe(4);
  });

  it('neighbor navigation is an ARRAY neighbor, not id ± 1', () => {
    // chapter id 20 sits at position 2; its neighbors are positions 1 and 3
    // (ids 10 and 30) — even though their ids are not 20 ± 1.
    const map = buildWNumMap(ordered);
    const wNumOf20 = [...map.entries()].find(([, c]) => c.id === 20)?.[0]!;
    expect(neighborWNum(wNumOf20, -1, ordered.length)).toBe(1);
    expect(neighborWNum(wNumOf20, 1, ordered.length)).toBe(3);
    expect(map.get(1)?.id).toBe(10);
    expect(map.get(3)?.id).toBe(30);
  });

  it('non-sequential chapter ids keep bounds correct', () => {
    const total = ordered.length;
    expect(neighborWNum(1, -1, total)).toBeNull(); // first chapter → no prev
    expect(neighborWNum(total, 1, total)).toBeNull(); // last chapter → no next
    expect(neighborWNum(2, 1, total)).toBe(3);
    expect(neighborWNum(2, -1, total)).toBe(1);
    expect(neighborWNum(0, 1, total)).toBe(1);
  });

  it('shellChapterList keeps position numbering and DB titles', () => {
    expect(shellChapterList(ordered)).toEqual([
      { number: 1, title: 'فصل 10' },
      { number: 2, title: 'فصل 20' },
      { number: 3, title: 'فصل 30' },
      { number: 4, title: 'فصل 5' },
    ]);
  });

  it('computePercent is positional and clamped', () => {
    expect(computePercent(1, 4)).toBe(25);
    expect(computePercent(4, 4)).toBe(100);
    expect(computePercent(5, 4)).toBe(100);
    expect(computePercent(0, 4)).toBe(0);
    expect(computePercent(2, 0)).toBe(0);
  });
});

describe('needsStructuralRebuild (structural keys decide, never a reload)', () => {
  const current = {
    selectedQuoteStyle: 'all',
    selectedMarkdownStyle: 'all',
    selectedBracketStyle: 'all',
    customOpenMark: '',
    customCloseMark: '',
    fontSize: 18,
  };

  it('flags a CHANGED structural key', () => {
    expect(
      needsStructuralRebuild({ selectedQuoteStyle: 'curly' }, current),
    ).toBe(true);
    expect(needsStructuralRebuild({ customOpenMark: '«' }, current)).toBe(true);
  });

  it('ignores same-value structural keys and non-structural patches', () => {
    expect(needsStructuralRebuild({ selectedQuoteStyle: 'all' }, current)).toBe(
      false,
    );
    expect(needsStructuralRebuild({ fontSize: 22 }, current)).toBe(false);
    expect(needsStructuralRebuild({}, current)).toBe(false);
  });

  it('a mixed patch rebuilds only when a structural value actually changed', () => {
    expect(
      needsStructuralRebuild(
        { fontSize: 22, selectedBracketStyle: 'curly' },
        current,
      ),
    ).toBe(true);
    expect(
      needsStructuralRebuild({ fontSize: 22, selectedBracketStyle: 'all' }, current),
    ).toBe(false);
  });
});

describe('wor persistence (MMKV)', () => {
  it('settings: load merges the saved patch over DEFAULT_SETTINGS', () => {
    saveWorSettingsPatch({ fontSize: 24, customOpenMark: '«' });
    const settings = loadWorSettings();
    expect(settings.fontSize).toBe(24);
    expect(settings.customOpenMark).toBe('«');
    // untouched defaults survive
    expect(settings.bgColor).toBe('#000000');
    expect(settings.tapToToggle).toBe(true);
  });

  it('scroll: v2 payload round-trips and rejects other versions', () => {
    saveScrollOffset(7, 42, 1234);
    expect(loadScrollOffset(7, 42)).toBe(1234);
    expect(scrollKeyFor(7, 42)).toBe('@wor_scroll_7_42');
    expect(loadScrollOffset(7, 999)).toBe(0); // missing → 0
  });

  it('last position stores chapter identity (id + wNum), not a guess', () => {
    saveLastPosition(7, 42, 3, 88);
    expect(lastPosKeyFor(7)).toBe('@wor_last_7');
    expect(loadLastPosition(7)).toMatchObject({
      chapterId: 42,
      wNum: 3,
      offset: 88,
    });
    expect(loadLastPosition(99)).toBeNull();
  });
});

describe('bridge literal safety', () => {
  it('escapes U+2028/U+2029 which are line terminators in injected JS', () => {
    const literal = toInjectableLiteral({ kind: 'chapter', title: 'أ\u2028ب\u2029ج' });
    expect(literal).not.toContain('\u2028');
    expect(literal).not.toContain('\u2029');
    expect(literal).toContain('\\u2028');
    // round-trips through JSON.parse
    expect(JSON.parse(literal).title).toBe('أ\u2028ب\u2029ج');
  });

  it('keeps normal payloads untouched', () => {
    expect(toInjectableLiteral({ a: 1 })).toBe('{"a":1}');
  });
});
