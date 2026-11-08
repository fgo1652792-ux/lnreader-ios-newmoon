// src/services/translation/memory.ts
//
// Port of ZEUSNext/TranslationMemory.swift — persistent translation memory
// keyed by SHA-256(namespace + "\0" + source text). Keys never contain the
// original text, URL, or credentials; entries survive restarts until
// explicitly cleared or evicted by the bounded-size policy.
//
// Storage: the app's existing op-sqlite database (lnreader.db) via the raw
// handle — Zeus kept one SQLite file per profile under Application Support;
// here the same schema lives in its own tables, created on first use so the
// existing drizzle migration chain and user data stay untouched.
//
// Tables:
//   TranslationEntry   — Zeus's `translations` table, verbatim columns.
//   TranslationChapter — per (novelId, chapterId, namespace) completion
//                        records for stats / preload / storage UI.

import { db as rawDb } from '../../database/db';
import type { DB } from '@op-engineering/op-sqlite';
import { sha256Hex } from './sha256';
import {
  AIProviderConfiguration,
  TranslationPreferences,
  TranslationSegment,
} from './types';

export const TRANSLATION_MAX_BYTES = 32 * 1024 * 1024; // Zeus maximumBytes
const EVICT_THRESHOLD = 24 * 1024 * 1024; // Zeus save() eviction point

let initialized = false;

/**
 * TEST HOOK: inject an alternative database handle (in-memory fake). The
 * production module keeps using the shared lnreader.db connection.
 */
let overrideDb: DB | null = null;
export const __setDatabaseForTests = (database: DB | null): void => {
  overrideDb = database;
  initialized = false;
};

const activeDb = (): DB => (overrideDb ?? (rawDb as unknown as DB)) as DB;

const ensureSchema = (database: DB | null | undefined): boolean => {
  if (initialized) return true;
  if (!database || typeof database.executeSync !== 'function') return false;
  try {
    database.executeSync(
      `CREATE TABLE IF NOT EXISTS TranslationEntry (
      key TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      used REAL NOT NULL,
      bytes INTEGER NOT NULL
    );`,
    );
    database.executeSync(
      'CREATE INDEX IF NOT EXISTS translation_lru ON TranslationEntry(used);',
    );
    database.executeSync(
      `CREATE TABLE IF NOT EXISTS TranslationChapter (
      novelId INTEGER NOT NULL,
      chapterId INTEGER NOT NULL,
      namespace TEXT NOT NULL,
      segments INTEGER NOT NULL DEFAULT 0,
      bytes INTEGER NOT NULL DEFAULT 0,
      updatedAt REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (chapterId, namespace)
    );`,
    );
    database.executeSync(
      'CREATE INDEX IF NOT EXISTS translation_chapter_novel ON TranslationChapter(novelId);',
    );
    initialized = true;
    return true;
  } catch {
    // schema setup failed (DB unavailable) — the caller falls back to
    // session-memory semantics, exactly like Zeus's storageNotice path
    return false;
  }
};

/** Zeus namespace() — identical identity inputs; digest over JSON array. */
export const memoryNamespace = (
  page: string,
  preferences: TranslationPreferences,
  provider?: AIProviderConfiguration | null,
): string => {
  let url = page;
  try {
    const parsed = new URL(page);
    parsed.hash = '';
    url = parsed.toString();
  } catch {
    // not a URL — keep as-is (reader chapters pass synthetic ids)
  }
  const identity: unknown[] = [
    'v2',
    url,
    preferences.engine,
    preferences.target,
    preferences.engine === 'ai' ? provider?.id ?? '' : '',
    preferences.engine === 'ai' ? provider?.baseURL ?? '' : '',
    preferences.engine === 'ai' ? provider?.model ?? '' : '',
    preferences.engine === 'ai' ? provider?.instruction ?? '' : '',
    preferences.engine === 'ai' ? provider?.projectID ?? '' : '',
    preferences.engine === 'ai' ? provider?.conversationID ?? '' : '',
  ];
  if (preferences.engine === 'cloudflare') {
    const config = preferences.cloudflare;
    identity.push(
      config?.endpoint ?? '',
      config?.accountID ?? '',
      config?.model ?? '',
      config?.instruction ?? '',
    );
  }
  return sha256Hex(JSON.stringify(identity));
};

/** Zeus key() — namespace + NUL + source text, hashed. */
const memoryKey = (text: string, namespace: string): string =>
  sha256Hex(`${namespace}\0${text}`);

export type MemoryStats = { entries: number; bytes: number };

export type ChapterUsage = {
  novelId: number;
  chapterId: number;
  namespace: string;
  segments: number;
  bytes: number;
  updatedAt: number;
};

/**
 * Actor → plain module functions. op-sqlite execute() is async and its native
 * queue serializes access, matching the Swift actor's serialization intent.
 */
export const TranslationMemory = {
  /** Zeus lookup() — batched reads + LRU touch in one transaction. */
  async lookup(
    segments: TranslationSegment[],
    namespace: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!segments.length) return result;
    const database = activeDb();
    if (!ensureSchema(database)) return result;
    const touched: [number, string][] = [];
    await database.transaction(async tx => {
      for (const segment of segments) {
        const key = memoryKey(segment.text, namespace);
        const row = await tx.execute(
          'SELECT text FROM TranslationEntry WHERE key=?;',
          [key],
        );
        const text = row.rows?.[0]?.text;
        if (typeof text === 'string') {
          result.set(segment.text, text);
          touched.push([Date.now() / 1000, key]);
        }
      }
    });
    return result;
  },

  /** Zeus save() — bounded insert with LRU eviction, all or nothing. */
  async save(
    values: Map<string, string> | Record<string, string>,
    namespace: string,
  ): Promise<boolean> {
    const entries =
      values instanceof Map
        ? Array.from(values.entries())
        : Object.entries(values);
    if (!entries.length) return true;
    const database = activeDb();
    if (!ensureSchema(database)) return false;
    try {
      await database.transaction(async tx => {
        const sizeRow = await tx.execute(
          'SELECT COALESCE(SUM(bytes),0) AS total FROM TranslationEntry;',
        );
        let bytes = Number(sizeRow.rows?.[0]?.total ?? 0);
        const incoming = entries.reduce(
          (sum, [, text]) => sum + text.length + 256,
          0,
        );
        if (bytes + incoming > EVICT_THRESHOLD) {
          // Evict the oldest quarter (same policy as Zeus, keyed differently
          // only in table naming).
          await tx.execute(
            `DELETE FROM TranslationEntry WHERE key IN (
               SELECT key FROM TranslationEntry ORDER BY used
               LIMIT MAX(256, (SELECT COUNT(*)/4 FROM TranslationEntry))
             );`,
          );
          const after = await tx.execute(
            'SELECT COALESCE(SUM(bytes),0) AS total FROM TranslationEntry;',
          );
          bytes = Number(after.rows?.[0]?.total ?? 0);
        }
        for (const [source, text] of entries) {
          if (text.length >= 1_000_000) continue;
          await tx.execute(
            `INSERT OR REPLACE INTO TranslationEntry(key,text,used,bytes)
             VALUES(?,?,?,?);`,
            [
              memoryKey(source, namespace),
              text,
              Date.now() / 1000,
              text.length + 256,
            ],
          );
          bytes += text.length + 256;
        }
      });
      return true;
    } catch {
      return false;
    }
  },

  /** Chapter completion bookkeeping (no Zeus equivalent — Moon storage UI). */
  async recordChapter(record: {
    novelId: number;
    chapterId: number;
    namespace: string;
    segments: number;
    bytes: number;
  }): Promise<void> {
    const database = activeDb();
    if (!ensureSchema(database)) return;
    try {
      await database.execute(
        `INSERT OR REPLACE INTO TranslationChapter(novelId,chapterId,namespace,segments,bytes,updatedAt)
       VALUES(?,?,?,?,?,?);`,
        [
          record.novelId,
          record.chapterId,
          record.namespace,
          record.segments,
          record.bytes,
          Date.now() / 1000,
        ],
      );
    } catch {
      // best-effort bookkeeping — never break the reading flow
    }
  },

  /** Progress rows for a novel keyed by chapter id. */
  async chapterProgress(
    novelId: number,
    namespace: string,
  ): Promise<Map<number, ChapterUsage>> {
    const map = new Map<number, ChapterUsage>();
    const database = activeDb();
    if (!ensureSchema(database)) return map;
    try {
      const rows = await database.execute(
        'SELECT chapterId, segments, bytes, updatedAt FROM TranslationChapter WHERE novelId=? AND namespace=?;',
        [novelId, namespace],
      );
      for (const row of rows.rows ?? []) {
        map.set(Number(row.chapterId), {
          novelId,
          chapterId: Number(row.chapterId),
          namespace,
          segments: Number(row.segments ?? 0),
          bytes: Number(row.bytes ?? 0),
          updatedAt: Number(row.updatedAt ?? 0),
        });
      }
    } catch {
      // storage unavailable — empty progress
    }
    return map;
  },

  /** Aggregate stats for the storage screen. */
  async stats(): Promise<MemoryStats> {
    const database = activeDb();
    if (!ensureSchema(database)) return { entries: 0, bytes: 0 };
    try {
      const countRow = await database.execute(
        'SELECT COUNT(*) AS count FROM TranslationEntry;',
      );
      const chapterRow = await database.execute(
        'SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM TranslationChapter;',
      );
      return {
        entries: Number(countRow.rows?.[0]?.count ?? 0),
        bytes: Number(chapterRow.rows?.[0]?.bytes ?? 0),
      };
    } catch {
      return { entries: 0, bytes: 0 };
    }
  },

  /** Per-novel stats (chapter count + stored bytes). */
  async novelStats(
    novelId: number,
    namespace: string,
  ): Promise<{
    chapters: number;
    bytes: number;
    lastUsed: number;
  }> {
    const database = activeDb();
    if (!ensureSchema(database)) {
      return { chapters: 0, bytes: 0, lastUsed: 0 };
    }
    try {
      const row = await database.execute(
        `SELECT COUNT(*) AS chapters, COALESCE(SUM(bytes),0) AS bytes,
                COALESCE(MAX(updatedAt),0) AS lastUsed
         FROM TranslationChapter WHERE novelId=? AND namespace=?;`,
        [novelId, namespace],
      );
      const first = row.rows?.[0];
      return {
        chapters: Number(first?.chapters ?? 0),
        bytes: Number(first?.bytes ?? 0),
        lastUsed: Number(first?.lastUsed ?? 0),
      };
    } catch {
      return { chapters: 0, bytes: 0, lastUsed: 0 };
    }
  },

  /** Zeus clear() — remove entries; original chapters stay untouched. */
  async clearAll(): Promise<void> {
    const database = activeDb();
    if (!ensureSchema(database)) return;
    try {
      await database.execute('DELETE FROM TranslationEntry;');
      await database.execute('DELETE FROM TranslationChapter;');
    } catch {
      // surfaced through stats staying unchanged
    }
  },

  /** Delete one novel's chapter records (entries are text-keyed, shared). */
  async clearNovel(novelId: number): Promise<void> {
    const database = activeDb();
    if (!ensureSchema(database)) return;
    try {
      await database.execute(
        'DELETE FROM TranslationChapter WHERE novelId=?;',
        [novelId],
      );
    } catch {
      // best-effort
    }
  },

  async clearChapters(chapterIds: number[]): Promise<void> {
    if (!chapterIds.length) return;
    const database = activeDb();
    if (!ensureSchema(database)) return;
    try {
      await database.transaction(async tx => {
        for (const id of chapterIds) {
          await tx.execute(
            'DELETE FROM TranslationChapter WHERE chapterId=?;',
            [id],
          );
        }
      });
    } catch {
      // best-effort
    }
  },
};
