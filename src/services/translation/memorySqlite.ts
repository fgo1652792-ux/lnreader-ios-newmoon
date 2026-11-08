import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import type { MemoryDriver } from './memory';

// op-sqlite driver for the translation memory database. Mirrors Zeus
// TranslationMemory storage: a dedicated "translations" SQLite file (never in
// Caches — iOS must not purge paid translations), so clearing app caches or
// library data never touches it.

let dbInstance: DB | null = null;

const getDb = (): DB => {
  if (!dbInstance) {
    dbInstance = open({ name: 'translations.db' });
  }
  return dbInstance;
};

export const createSqliteMemoryDriver = (): MemoryDriver => ({
  async execute(sql: string, params?: (string | number | null)[]) {
    const db = getDb();
    await db.execute(sql, params as Scalar[] | undefined);
  },
  async query<T>(sql: string, params?: (string | number | null)[]) {
    const db = getDb();
    const result = await db.execute(sql, params as Scalar[] | undefined);
    return (result.rows ?? []) as unknown as T[];
  },
  async transaction(statements) {
    const db = getDb();
    // executeBatch runs the whole set atomically inside one transaction.
    await db.executeBatch(
      statements.map(statement => [statement.sql, (statement.params ?? []) as Scalar[]] as [string, Scalar[]]),
    );
  },
});
