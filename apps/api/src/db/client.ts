import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Db } from '../db.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDatabase(pool: Db): Database {
  return drizzle(pool, { schema });
}
