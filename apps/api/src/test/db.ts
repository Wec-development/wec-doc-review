import { TransactionRollbackError } from 'drizzle-orm';
import { expect } from 'vitest';
import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { createDatabase, type Database, type Transaction } from '../db/client.js';
import { documents, documentVersions } from '../db/schema.js';

export interface TestDatabase {
  db: Database;
  close: () => Promise<void>;
}

/** Connects to the Postgres in DATABASE_URL (Docker on localhost:5433 by default). */
export function connectTestDatabase(): TestDatabase {
  const pool = createDb(loadConfig().DATABASE_URL);
  return { db: createDatabase(pool), close: () => pool.end() };
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

interface PgConstraintError {
  code: string;
  constraint?: string;
}

function isPgConstraintError(error: unknown): error is PgConstraintError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/** Drizzle wraps driver errors; walk the cause chain to the Postgres error. */
function findPgError(error: unknown): PgConstraintError | undefined {
  let current: unknown = error;
  while (current instanceof Error || isPgConstraintError(current)) {
    if (isPgConstraintError(current)) {
      return current;
    }
    current = current.cause;
  }
  return undefined;
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
