import type { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { Db } from '../db.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the pool-backed database or an open transaction; repositories accept both. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export function createDatabase(pool: Db): Database {
  return drizzle(pool, { schema });
}
