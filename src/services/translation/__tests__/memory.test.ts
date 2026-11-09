// TranslationMemory — Zeus cache discipline on an injected driver: stable
// namespace/entry hashing, save+lookup round trips, LRU eviction with the
// min-256 floor, the 1 MB source skip, scoped ref removal, clear, and the
// per-namespace session cache.

import { TranslationMemory, entryKey, namespaceHash } from '../memory';
import { InMemoryMemoryDriver } from './helpers';

const IDENTITY = ['v2', 'reader:novel-1:chapter-1', 'googleWeb', 'ar'];
const OTHER_IDENTITY = ['v2', 'reader:novel-1:chapter-2', 'googleWeb', 'ar'];

const keyOf = (identity: string[], text: string): string =>
  entryKey(namespaceHash(identity), text);

describe('namespaceHash and entryKey', () => {
  it('is stable for the same identity and changes when the target changes', () => {
    const first = namespaceHash(IDENTITY);
    expect(namespaceHash([...IDENTITY])).toBe(first);
    expect(namespaceHash(IDENTITY)).toMatch(/^[0-9a-f]{64}$/);

    expect(namespaceHash(['v2', 'reader:novel-1:chapter-1', 'googleWeb', 'en'])).not.toBe(first);
    expect(namespaceHash(['v2', 'reader:novel-1:chapter-2', 'googleWeb', 'ar'])).not.toBe(first);
  });

  it('derives distinct keys per text and per namespace, deterministically', () => {
    expect(entryKey(namespaceHash(IDENTITY), 'نص أول')).toBe(
      entryKey(namespaceHash(IDENTITY), 'نص أول'),
    );
    expect(entryKey(namespaceHash(IDENTITY), 'نص أول')).toMatch(/^[0-9a-f]{64}$/);
    expect(entryKey(namespaceHash(IDENTITY), 'نص أول')).not.toBe(
      entryKey(namespaceHash(IDENTITY), 'نص ثانٍ'),
    );
    expect(keyOf(IDENTITY, 'نص أول')).not.toBe(keyOf(OTHER_IDENTITY, 'نص أول'));
  });
});

describe('TranslationMemory save and lookup', () => {
  it('round-trips a saved translation scoped to its namespace', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);

    await memory.save(IDENTITY, new Map([['نص للترجمة', 'ترجمة جاهزة']]));

    const hits = await memory.lookup(IDENTITY, ['نص للترجمة', 'غير محفوظة']);
    expect(hits.size).toBe(1);
    expect(hits.get('نص للترجمة')).toBe('ترجمة جاهزة');
    expect(hits.has('غير محفوظة')).toBe(false);

    // A different namespace (other chapter) must not see the entry.
    const other = await new TranslationMemory(driver).lookup(OTHER_IDENTITY, ['نص للترجمة']);
    expect(other.size).toBe(0);
  });

  it('stores refs with engine/target metadata so scoped removal can find them', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);

    await memory.save(IDENTITY, new Map([['نص مرجعي', 'ترجمته']]), {
      novelId: 'novel-1',
      chapterId: 'chapter-1',
      engine: 'googleWeb',
      target: 'ar',
    });

    const ref = driver.refs.get(keyOf(IDENTITY, 'نص مرجعي'));
    expect(ref).toEqual({
      novelId: 'novel-1',
      chapterId: 'chapter-1',
      engine: 'googleWeb',
      target: 'ar',
      updatedAt: expect.any(Number),
    });
  });
});

describe('TranslationMemory LRU eviction', () => {
  it('evicts the oldest 256 rows (not COUNT/4) once the byte budget is exceeded', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver, 300 * 260); // 300 entries of 260 bytes
    let tick = 0;
    memory.setClock(() => {
      tick += 1;
      return tick;
    });

    const pad = (value: number): string => String(value).padStart(3, '0');
    // 301 saves: 300 fit the budget exactly (4-byte text + 256 overhead =
    // 260 bytes each); save #301 tips it and triggers the eviction pass.
    for (let index = 0; index <= 300; index += 1) {
      await memory.save(IDENTITY, new Map([[`t${pad(index)}`, `x${pad(index)}`]]));
    }

    const stats = await memory.stats();
    // 301 stored − 256 evicted = 45. A naive COUNT/4 limit (75) would leave 226.
    expect(stats.entries).toBe(45);

    const stored = (text: string): boolean => driver.translations.has(keyOf(IDENTITY, text));
    expect(stored('t000')).toBe(false); // oldest → evicted
    expect(stored('t255')).toBe(false); // exactly the 256th oldest → evicted
    expect(stored('t256')).toBe(true); // first survivor of the floor
    expect(stored('t300')).toBe(true); // newest entry still lands
  });
});

describe('TranslationMemory huge-source skip', () => {
  it('never stores sources at or above the 1,000,000-byte cap', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);

    const huge = 'a'.repeat(1_000_000); // utf8 length == cap → skipped
    await memory.save(IDENTITY, new Map([[huge, 'مترجم']]));
    expect((await memory.stats()).entries).toBe(0);
    expect((await memory.lookup(IDENTITY, [huge])).size).toBe(0);
  });

  it('still stores sources just below the cap alongside huge ones', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);

    const huge = 'a'.repeat(1_000_000);
    const near = 'b'.repeat(999_999); // utf8 length < cap → stored
    await memory.save(IDENTITY, new Map<string, string>([
      [huge, 'مترجم'],
      [near, 'مخزّن'],
    ]));

    const stats = await memory.stats();
    expect(stats.entries).toBe(1);
    expect((await memory.lookup(IDENTITY, [near])).get(near)).toBe('مخزّن');
  });
});

describe('TranslationMemory statsByNovel', () => {
  it('groups entry count and bytes per novel, largest bytes first', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);
    const ref = (novelId: string) => ({
      novelId,
      chapterId: 'c1',
      engine: 'googleWeb',
      target: 'ar',
    });

    // n1: 266 + 276 bytes, n2: 261 bytes (utf8 length + 256 overhead).
    await memory.save(IDENTITY, new Map([['ألف', 'x'.repeat(10)]]), ref('n1'));
    await memory.save(IDENTITY, new Map([['باء', 'y'.repeat(20)]]), ref('n1'));
    await memory.save(OTHER_IDENTITY, new Map([['جيم', 'z'.repeat(5)]]), ref('n2'));

    expect(await memory.statsByNovel()).toEqual([
      { novelId: 'n1', count: 2, bytes: 542 },
      { novelId: 'n2', count: 1, bytes: 261 },
    ]);
  });

  it('reflects removeNovel in the per-novel breakdown', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);
    const ref = { novelId: 'n1', chapterId: 'c1', engine: 'googleWeb', target: 'ar' };

    await memory.save(IDENTITY, new Map([['ألف', 'مترجم']]), ref);
    await memory.save(IDENTITY, new Map([['دال', 'مترجم']]), { ...ref, novelId: 'n2' });

    await memory.removeNovel('n1');

    expect(await memory.statsByNovel()).toEqual([
      { novelId: 'n2', count: 1, bytes: 10 + 256 },
    ]);
  });
});

describe('TranslationMemory scoped removal', () => {
  it('removeChapter removes only that chapter, leaving siblings and other novels', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);
    const ref = (chapterId: string, novelId = 'n1') => ({
      novelId,
      chapterId,
      engine: 'googleWeb',
      target: 'ar',
    });

    await memory.save(IDENTITY, new Map([['ألف', '1']]), ref('c1'));
    await memory.save(IDENTITY, new Map([['باء', '2']]), ref('c1'));
    await memory.save(IDENTITY, new Map([['جيم', '3']]), ref('c2'));
    await memory.save(IDENTITY, new Map([['دال', '4']]), ref('c1', 'n2'));
    await memory.save(IDENTITY, new Map([['هاء', '5']])); // no ref at all

    await memory.removeChapter('n1', 'c1');

    const stored = (text: string): boolean => driver.translations.has(keyOf(IDENTITY, text));
    expect(stored('ألف')).toBe(false);
    expect(stored('باء')).toBe(false);
    expect(stored('جيم')).toBe(true); // same novel, other chapter
    expect(stored('دال')).toBe(true); // same chapter id, other novel
    expect(stored('هاء')).toBe(true); // never had a ref

    expect(driver.refs.has(keyOf(IDENTITY, 'ألف'))).toBe(false);
    expect(driver.refs.has(keyOf(IDENTITY, 'جيم'))).toBe(true);
    expect(driver.refs.has(keyOf(IDENTITY, 'دال'))).toBe(true);
  });

  it('removeNovel removes every chapter of the novel but leaves other novels', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);
    const ref = { novelId: 'n1', chapterId: 'c1', engine: 'googleWeb', target: 'ar' };

    await memory.save(IDENTITY, new Map([['ألف', '1']]), ref);
    await memory.save(OTHER_IDENTITY, new Map([['جيم', '3']]), {
      ...ref,
      chapterId: 'c2',
    });
    await memory.save(IDENTITY, new Map([['دال', '4']]), { ...ref, novelId: 'n2' });

    await memory.removeNovel('n1');

    const stored = (identity: string[], text: string): boolean =>
      driver.translations.has(keyOf(identity, text));
    expect(stored(IDENTITY, 'ألف')).toBe(false);
    expect(stored(OTHER_IDENTITY, 'جيم')).toBe(false);
    expect(stored(IDENTITY, 'دال')).toBe(true);
  });
});

describe('TranslationMemory clear', () => {
  it('empties translations, refs and the session cache', async () => {
    const driver = new InMemoryMemoryDriver();
    const memory = new TranslationMemory(driver);
    await memory.save(IDENTITY, new Map([['نص', 'ترجمة']]), {
      novelId: 'n1',
      chapterId: 'c1',
      engine: 'googleWeb',
      target: 'ar',
    });

    await memory.clear();

    expect(await memory.stats()).toEqual({ entries: 0, bytes: 0 });
    expect(driver.refs.size).toBe(0);
    // clear() also resets the session cache, so this goes back to disk (miss).
    expect((await memory.lookup(IDENTITY, ['نص'])).size).toBe(0);
  });
});

describe('TranslationMemory session cache', () => {
  it('serves repeat lookups from the session without re-querying the driver', async () => {
    const driver = new InMemoryMemoryDriver();
    // Prefill the "disk" directly so the session cache starts cold.
    driver.translations.set(keyOf(IDENTITY, 'النص الأول'), {
      text: 'الترجمة الأولى',
      used: 1,
      bytes: 300,
    });
    driver.translations.set(keyOf(IDENTITY, 'النص الثاني'), {
      text: 'الترجمة الثانية',
      used: 2,
      bytes: 300,
    });

    const memory = new TranslationMemory(driver);
    const first = await memory.lookup(IDENTITY, ['النص الأول', 'النص الثاني']);
    expect(first.size).toBe(2);
    expect(first.get('النص الأول')).toBe('الترجمة الأولى');
    const queriesAfterFirst = driver.queryCount;
    expect(queriesAfterFirst).toBe(2);

    // Second identical lookup: fully served by the session cache.
    const second = await memory.lookup(IDENTITY, ['النص الأول', 'النص الثاني']);
    expect(second.size).toBe(2);
    expect(driver.queryCount).toBe(queriesAfterFirst);

    // A key that is not cached still goes to disk exactly once.
    const partial = await memory.lookup(IDENTITY, ['النص الأول', 'غير مخزّن']);
    expect(partial.size).toBe(1);
    expect(driver.queryCount).toBe(queriesAfterFirst + 1);

    // A fresh instance (cold session) re-reads the same disk rows.
    const fresh = new TranslationMemory(driver);
    expect((await fresh.lookup(IDENTITY, ['النص الثاني'])).size).toBe(1);
    expect(driver.queryCount).toBe(queriesAfterFirst + 2);

    // resetSession() drops the warm entries as well.
    memory.resetSession();
    expect((await memory.lookup(IDENTITY, ['النص الأول'])).size).toBe(1);
    expect(driver.queryCount).toBe(queriesAfterFirst + 3);
  });
});
