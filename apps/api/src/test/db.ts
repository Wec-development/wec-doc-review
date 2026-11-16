import { sql, TransactionRollbackError } from 'drizzle-orm';
import { expect, inject } from 'vitest';
import { createDb } from '../db.js';
import { createDatabase, type Database, type Transaction } from '../db/client.js';
import { findPgError } from '../db/pg-errors.js';
import { documents, documentVersions } from '../db/schema.js';

export interface TestDatabase {
  db: Database;
  close: () => Promise<void>;
}

/** Connects to the migrated `<db>_test` database prepared by global-setup.ts. */
export function connectTestDatabase(): TestDatabase {
  const pool = createDb(inject('databaseUrl'));
  return { db: createDatabase(pool), close: () => pool.end() };
}

/**
 * Empties every table (committed). Refuses to run anywhere but a `_test` database, so a
 * misconfigured run can never wipe development data.
 */
export async function resetDatabase(db: Database): Promise<void> {
  const [row] = (await db.execute<{ name: string }>(sql`select current_database() as name`)).rows;
  if (!row?.name.endsWith('_test')) {
    throw new Error(`Refusing to truncate non-test database "${row?.name ?? 'unknown'}"`);
  }
  await db.execute(
    sql`truncate table reviews, extracted_values, extraction_jobs, document_versions, documents, llm_settings`,
  );
}

/**
 * Runs the test body in a transaction that is always rolled back, so tests are isolated from
 * each other and never change the developer's seeded data.
 */
export async function withRollback(
  db: Database,
  body: (tx: Transaction) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await body(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) {
      throw error;
    }
  }
}

/**
 * Asserts that the statement is rejected by the named constraint. It runs in a savepoint so the
 * surrounding test transaction stays usable afterwards.
 */
export async function expectConstraintViolation(
  tx: Transaction,
  statement: (savepoint: Transaction) => Promise<unknown>,
  constraint: string,
): Promise<void> {
  const outcome = await tx.transaction(statement).then(
    () => ({ rejected: false as const }),
    (error: unknown) => ({ rejected: true as const, error }),
  );
  expect(outcome.rejected, `expected ${constraint} to reject the statement`).toBe(true);
  if (outcome.rejected) {
    expect(findPgError(outcome.error)?.constraint).toBe(constraint);
  }
}

/** Creates a document with one queued version and returns the version id. */
export async function insertDocumentVersion(tx: Transaction): Promise<string> {
  const [document] = await tx
    .insert(documents)
    .values({ type: 'invoice', title: 'Test invoice' })
    .returning({ id: documents.id });
  if (!document) {
    throw new Error('Inserting a test document returned no row');
  }
  const [version] = await tx
    .insert(documentVersions)
    .values({ documentId: document.id, versionNo: 1, filePath: 'fixtures/test.pdf' })
    .returning({ id: documentVersions.id });
  if (!version) {
    throw new Error('Inserting a test version returned no row');
  }
  return version.id;
}
