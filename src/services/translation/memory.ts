import { sha256Hex } from './sha256';

// Port of Zeus Ascent Edition: ZEUSNext/TranslationMemory.swift — pure logic
// (driver-injected so node tests can run it on better-sqlite3 and the app runs
// it on @op-engineering/op-sqlite, see memorySqlite.ts).
//
// Zeus invariants preserved verbatim:
// - namespace = SHA256 hex of the JSON-serialized identity array
// - entry key  = SHA256 hex of (namespaceHash + "\\0" + text)
// - no raw URL/text/secret is stored as a key
// - LRU touch on hits, batched in one transaction
// - eviction when total bytes + incoming > 24 MB: oldest 25%, min 256 rows
// - entries with utf8 length >= 1,000,000 are never stored
// - per-entry byte accounting: text utf8 + 256 fixed overhead

export const MEMORY_SCHEMA = `
PRAGMA journal_mode=DELETE;
CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY, text TEXT NOT NULL, used REAL NOT NULL, bytes INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS translation_lru ON translations(used);
CREATE TABLE IF NOT EXISTS translation_refs (key TEXT PRIMARY KEY, novelId TEXT NOT NULL, chapterId TEXT NOT NULL, engine TEXT NOT NULL, target TEXT NOT NULL, updatedAt REAL NOT NULL);
CREATE INDEX IF NOT EXISTS translation_refs_chapter ON translation_refs(novelId, chapterId);
`;

// Moon novels extension: refs table maps cache keys to novel/chapter so the
// library UI can delete translations per novel/chapter and show real stats.
// (Zeus only exposed global LRU entries(); the core translations table and its
// semantics are unchanged.)

export interface MemoryDriver {
  execute(sql: string, params?: (string | number | null)[]): Promise<void>;
  query<T>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
  transaction(statements: { sql: string; params?: (string | number | null)[] }[]): Promise<void>;
}

export interface MemoryEntry {
  key: string;
  text: string;
  used: number;
  bytes: number;
}

const MAXIMUM_BYTES = 24 * 1024 * 1024;
const OVERHEAD_BYTES = 256;
const MAX_ENTRY_BYTES = 1_000_000;
const SESSION_MAX_ENTRIES = 8000;
const SESSION_MAX_BYTES = 8_000_000;

const utf8Length = (text: string): number => {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {bytes += 1;}
    else if (code < 0x800) {bytes += 2;}
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else {bytes += 3;}
  }
  return bytes;
};

export const namespaceHash = (identity: string[]): string => sha256Hex(JSON.stringify(identity));

export const entryKey = (namespace: string, text: string): string =>
  sha256Hex(`${namespace}\0${text}`);

export interface TranslationMemoryStats {
  entries: number;
  bytes: number;
}

export class TranslationMemory {
  private readonly driver: MemoryDriver;
  private readonly maximumBytes: number;
  private now = () => Date.now() / 1000;

  // In-memory per-namespace session cache (Zeus PageTranslation.cache): hit
  // results are reused within a run without re-reading disk.
  private sessionCache = new Map<string, string>();
  private sessionBytes = 0;

  constructor(driver: MemoryDriver, maximumBytes = MAXIMUM_BYTES) {
    this.driver = driver;
    this.maximumBytes = maximumBytes;
  }

  async initialize(): Promise<void> {
    for (const statement of MEMORY_SCHEMA.split(';')) {
      const sql = statement.trim();
      if (sql.length > 0) await this.driver.execute(sql);
    }
  }

  // Zeus cache-discipline: namespace change invalidates the session cache.
  resetSession(): void {
    this.sessionCache = new Map();
    this.sessionBytes = 0;
  }

  private sessionPut(key: string, text: string): void {
    if (this.sessionCache.has(key)) return;
    this.sessionCache.set(key, text);
    this.sessionBytes += utf8Length(text) + OVERHEAD_BYTES;
    if (this.sessionCache.size > SESSION_MAX_ENTRIES || this.sessionBytes > SESSION_MAX_BYTES) {
      // Long-lived pages must not grow the in-memory dictionary unbounded.
      this.resetSession();
    }
  }

  // Lookup by source texts for one namespace; returns text->translation map
  // for hits only (Zeus lookup returns results keyed by original text).
  // Session cache is consulted first; disk hits get an LRU touch batched in
  // one transaction (Zeus: "one transaction, not one disk sync per paragraph").
  async lookup(namespace: string[], texts: string[]): Promise<Map<string, string>> {
    const ns = namespaceHash(namespace);
    const results = new Map<string, string>();
    const diskKeys: { key: string; text: string }[] = [];
    for (const text of texts) {
      const key = entryKey(ns, text);
      const session = this.sessionCache.get(key);
      if (session !== undefined) {
        results.set(text, session);
      } else {
        diskKeys.push({ key, text });
      }
    }
    if (diskKeys.length === 0) return results;
    const found = new Map<string, string>();
    for (const item of diskKeys) {
      const rows = await this.driver.query<{ text: string }>(
        'SELECT text FROM translations WHERE key = ?',
        [item.key],
      );
      if (rows.length > 0 && rows[0].text) found.set(item.key, rows[0].text);
    }
    if (found.size > 0) {
      const used = this.now();
      await this.driver.transaction(
        [...found.keys()].map(key => ({
          sql: 'UPDATE translations SET used = ? WHERE key = ?',
          params: [used, key],
        })),
      );
    }
    for (const item of diskKeys) {
      const value = found.get(item.key);
      if (value !== undefined) {
        results.set(item.text, value);
        this.sessionPut(item.key, value);
      }
    }
    return results;
  }

  async save(
    namespace: string[],
    values: Map<string, string>,
    ref?: { novelId: string; chapterId: string; engine: string; target: string },
  ): Promise<void> {
    const ns = namespaceHash(namespace);
    const rows: { key: string; source: string; translated: string; bytes: number }[] = [];
    let incoming = 0;
    for (const [text, translated] of values) {
      if (utf8Length(text) >= MAX_ENTRY_BYTES) continue; // Zeus: skip huge sources
      const bytes = utf8Length(translated) + OVERHEAD_BYTES;
      // Zeus schema: `text` column holds the TRANSLATED value; the source is
      // only ever hashed into the key. Never persisted in the clear.
      rows.push({ key: entryKey(ns, text), source: text, translated, bytes });
      incoming += bytes;
    }
    if (rows.length === 0) return;
    const stats = await this.stats();
    if (stats.bytes + incoming > this.maximumBytes) {
      await this.driver.execute(
        `DELETE FROM translations WHERE key IN (SELECT key FROM translations ORDER BY used LIMIT MAX(256, (SELECT COUNT(*)/4 FROM translations)))`,
      );
      await this.driver.execute(`DELETE FROM translation_refs WHERE key NOT IN (SELECT key FROM translations)`);
    }
    const used = this.now();
    const statements = rows.map(row => ({
      sql: 'INSERT OR REPLACE INTO translations(key, text, used, bytes) VALUES(?, ?, ?, ?)',
      params: [row.key, row.translated, used, row.bytes],
    }));
    if (ref) {
      for (const row of rows) {
        statements.push({
          sql: 'INSERT OR REPLACE INTO translation_refs(key, novelId, chapterId, engine, target, updatedAt) VALUES(?, ?, ?, ?, ?, ?)',
          params: [row.key, ref.novelId, ref.chapterId, ref.engine, ref.target, used],
        });
      }
    }
    await this.driver.transaction(statements);
    for (const row of rows) {
      // Session-cache only what was actually persisted (huge sources were
      // skipped above) — keeps disk and session views consistent.
      this.sessionPut(row.key, row.translated);
    }
  }

  async stats(): Promise<TranslationMemoryStats> {
    const rows = await this.driver.query<{ entries: number; bytes: number }>(
      'SELECT COUNT(*) AS entries, COALESCE(SUM(bytes), 0) AS bytes FROM translations',
    );
    return { entries: Number(rows[0]?.entries ?? 0), bytes: Number(rows[0]?.bytes ?? 0) };
  }

  async removeChapter(novelId: string, chapterId: string): Promise<void> {
    await this.driver.execute(
      `DELETE FROM translations WHERE key IN (SELECT key FROM translation_refs WHERE novelId = ? AND chapterId = ?)`,
      [novelId, chapterId],
    );
    await this.driver.execute(`DELETE FROM translation_refs WHERE novelId = ? AND chapterId = ?`, [
      novelId,
      chapterId,
    ]);
  }

  async removeNovel(novelId: string): Promise<void> {
    await this.driver.execute(
      `DELETE FROM translations WHERE key IN (SELECT key FROM translation_refs WHERE novelId = ?)`,
      [novelId],
    );
    await this.driver.execute(`DELETE FROM translation_refs WHERE novelId = ?`, [novelId]);
  }

  async clear(): Promise<void> {
    await this.driver.execute('DELETE FROM translations');
    await this.driver.execute('DELETE FROM translation_refs');
    this.resetSession();
  }

  // Exposed for tests (Zeus used a fixed clock via Date(); deterministic time
  // keeps LRU ordering assertions stable).
  setClock(now: () => number): void {
    this.now = now;
  }
}
