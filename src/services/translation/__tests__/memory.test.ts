// src/services/translation/__tests__/memory.test.ts
// TranslationMemory behavior over an injected in-memory fake DB:
// save → lookup roundtrip, namespace identity, chapter records, stats.

import {
  TranslationMemory,
  memoryNamespace,
  __setDatabaseForTests,
} from '../memory';
import type { DB } from '@op-engineering/op-sqlite';

// The shared lnreader.db handle opens a native connection at import time —
// not available under jest-expo. The memory module only touches it when no
// test override is installed, so a stub module is sufficient here.
jest.mock('../../../database/db', () => ({ db: {} }));

/** Minimal op-sqlite DB fake: rows as objects, tx passthrough. */
const makeFakeDb = (): DB => {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const tableNameOf = (sql: string): string => {
    const m = sql.match(
      /(?:INTO|FROM|UPDATE|TABLE IF NOT EXISTS|TABLE)\s+"?(\w+)"?/i,
    );
    return m ? m[1] : '';
  };
  const db = {
    executeSync: (sql: string) => {
      if (/CREATE TABLE/i.test(sql)) {
        const t = tableNameOf(sql);
        if (!tables.has(t)) tables.set(t, new Map());
      }
      if (/CREATE INDEX/i.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    execute: async (sql: string, params?: unknown[]) => {
      const table = tableNameOf(sql);
      const rows = tables.get(table) ?? new Map();
      if (/INSERT OR REPLACE INTO TranslationEntry/i.test(sql)) {
        rows.set(String(params?.[0]), {
          key: params?.[0],
          text: params?.[1],
          used: params?.[2],
          bytes: params?.[3],
        });
        tables.set(table, rows);
        return { rows: [] };
      }
      if (/INSERT OR REPLACE INTO TranslationChapter/i.test(sql)) {
        rows.set(`chapter:${params?.[1]}`, {
          novelId: params?.[0],
          chapterId: params?.[1],
          namespace: params?.[2],
          segments: params?.[3],
          bytes: params?.[4],
          updatedAt: params?.[5],
        });
        tables.set(table, rows);
        return { rows: [] };
      }
      if (/SELECT text FROM TranslationEntry WHERE key=\?/i.test(sql)) {
        const row = rows.get(String(params?.[0]));
        return { rows: row ? [{ text: row.text }] : [] };
      }
      if (/SELECT COUNT\(\*\) AS count FROM TranslationEntry/i.test(sql)) {
        return { rows: [{ count: rows.size }] };
      }
      if (
        /SELECT COUNT\(\*\) AS (count|chapters)[\s\S]*FROM TranslationChapter/i.test(
          sql,
        )
      ) {
        // honour the WHERE novelId=? AND namespace=? filter when present
        const filtered = Array.from(rows.values()).filter(row => {
          if (
            /WHERE novelId/i.test(sql) &&
            String(row.novelId) !== String(params?.[0])
          ) {
            return false;
          }
          return true;
        });
        let bytes = 0;
        let lastUsed = 0;
        for (const row of filtered) {
          bytes += Number(row.bytes ?? 0);
          lastUsed = Math.max(lastUsed, Number(row.updatedAt ?? 0));
        }
        return {
          rows: [
            {
              count: filtered.length,
              chapters: filtered.length,
              bytes,
              lastUsed,
            },
          ],
        };
      }
      if (
        /SELECT chapterId, segments, bytes, updatedAt FROM TranslationChapter/i.test(
          sql,
        )
      ) {
        const out: Record<string, unknown>[] = [];
        for (const row of rows.values()) {
          if (String(row.novelId) === String(params?.[0])) out.push(row);
        }
        return { rows: out };
      }
      if (/DELETE FROM TranslationChapter WHERE novelId=\?/i.test(sql)) {
        for (const [k, row] of Array.from(rows)) {
          if (String(row.novelId) === String(params?.[0])) rows.delete(k);
        }
        return { rows: [] };
      }
      if (/DELETE FROM/i.test(sql)) {
        if (/WHERE chapterId=\?/i.test(sql)) {
          const chapterId = String(params?.[0]);
          for (const [k, row] of Array.from(rows)) {
            if (String(row.chapterId) === chapterId) rows.delete(k);
          }
          return { rows: [] };
        }
        if (/novelId=\?/i.test(sql)) {
          for (const [k, row] of Array.from(rows)) {
            if (String(row.novelId) === String(params?.[0])) rows.delete(k);
          }
          return { rows: [] };
        }
        rows.clear();
        return { rows: [] };
      }
      return { rows: [] };
    },
    executeRaw: async () => [],
    executeRawSync: () => [],
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      await fn(db);
    },
  };
  return db as unknown as DB;
};

const NS = 'namespace-for-tests';

describe('memoryNamespace (Zeus identity inputs)', () => {
  const prefs = {
    engine: 'googleWeb',
    target: 'ar',
  } as never;

  it('is stable for identical inputs', () => {
    expect(memoryNamespace('https://x/y', prefs, null)).toBe(
      memoryNamespace('https://x/y', prefs, null),
    );
  });

  it('differs across engines and targets', () => {
    const aiPrefs = { engine: 'ai', target: 'ar' } as never;
    expect(memoryNamespace('https://x/y', prefs, null)).not.toBe(
      memoryNamespace('https://x/y', aiPrefs, null),
    );
    expect(memoryNamespace('https://x/y', prefs, null)).not.toBe(
      memoryNamespace('https://x/z', prefs, null),
    );
  });

  it('includes the provider identity for AI engines (paid isolation)', () => {
    const aiPrefs = { engine: 'ai', target: 'ar' } as never;
    const providerA = {
      id: 'id-a',
      baseURL: 'https://a',
      model: 'm1',
    } as never;
    const providerB = {
      id: 'id-b',
      baseURL: 'https://a',
      model: 'm1',
    } as never;
    expect(memoryNamespace('https://x/y', aiPrefs, providerA)).not.toBe(
      memoryNamespace('https://x/y', aiPrefs, providerB),
    );
  });
});

describe('TranslationMemory save/lookup (Zeus actor semantics)', () => {
  beforeEach(() => {
    __setDatabaseForTests(makeFakeDb());
  });
  afterAll(() => {
    __setDatabaseForTests(null);
  });

  it('roundtrips a saved translation', async () => {
    const segments = [
      { id: 'p1', text: 'Hello world' },
      { id: 'p2', text: 'Second paragraph' },
    ];
    await TranslationMemory.save({ 'Hello world': 'مرحبًا بالعالم' }, NS);
    const hits = await TranslationMemory.lookup(segments, NS);
    expect(hits.get('Hello world')).toBe('مرحبًا بالعالم');
    expect(hits.has('Second paragraph')).toBe(false);
  });

  it('keys are text+namespace scoped — no cross-novel leakage', async () => {
    await TranslationMemory.save({ 'shared heading': 'عنوان' }, 'novel-A');
    const hitsA = await TranslationMemory.lookup(
      [{ id: 'p1', text: 'shared heading' }],
      'novel-A',
    );
    const hitsB = await TranslationMemory.lookup(
      [{ id: 'p1', text: 'shared heading' }],
      'novel-B',
    );
    expect(hitsA.get('shared heading')).toBe('عنوان');
    expect(hitsB.has('shared heading')).toBe(false);
  });

  it('overwrites with the newest value (INSERT OR REPLACE)', async () => {
    await TranslationMemory.save({ key: 'old' }, NS);
    await TranslationMemory.save({ key: 'new' }, NS);
    const hits = await TranslationMemory.lookup([{ id: 'p', text: 'key' }], NS);
    expect(hits.get('key')).toBe('new');
  });

  it('records chapter completion and reports novel stats', async () => {
    await TranslationMemory.recordChapter({
      novelId: 7,
      chapterId: 42,
      namespace: NS,
      segments: 10,
      bytes: 1024,
    });
    const stats = await TranslationMemory.novelStats(7, NS);
    expect(stats.chapters).toBe(1);
    expect(stats.bytes).toBe(1024);
    const progress = await TranslationMemory.chapterProgress(7, NS);
    expect(progress.get(42)?.segments).toBe(10);
  });

  it('clearNovel removes only that novel chapter records', async () => {
    await TranslationMemory.recordChapter({
      novelId: 1,
      chapterId: 11,
      namespace: NS,
      segments: 5,
      bytes: 100,
    });
    await TranslationMemory.recordChapter({
      novelId: 2,
      chapterId: 22,
      namespace: NS,
      segments: 5,
      bytes: 100,
    });
    await TranslationMemory.clearNovel(1);
    const stats = await TranslationMemory.novelStats(1, NS);
    expect(stats.chapters).toBe(0);
  });
});
