import pg from 'pg';

export type Db = pg.Pool;

/**
 * An idle client errors when Postgres restarts; without a listener that 'error' event would
 * crash the process. The pool replaces the client, so reporting the error is enough.
 */
export function createDb(
  connectionString: string,
  onIdleClientError: (error: Error) => void = (error) =>
    console.error(`Postgres idle client error: ${error.message}`),
): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on('error', onIdleClientError);
  return pool;
}
