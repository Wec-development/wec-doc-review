import type { LlmProvider } from '@doc-review/shared';
import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { llmSettings } from '../db/schema.js';

const SINGLE_ROW_ID = 1;

export interface LlmSettingsRow {
  provider: LlmProvider;
  model: string;
  apiKeyCiphertext: Buffer;
  apiKeyIv: Buffer;
  apiKeyTag: Buffer;
  keyVersion: number;
  keyHint: string;
  lastVerifiedAt: Date;
  updatedAt: Date;
}

/** The saved settings, including the encrypted key parts; null until first configured. */
export async function findLlmSettings(db: Executor): Promise<LlmSettingsRow | null> {
  const [row] = await db
    .select({
      provider: llmSettings.provider,
      model: llmSettings.model,
      apiKeyCiphertext: llmSettings.apiKeyCiphertext,
      apiKeyIv: llmSettings.apiKeyIv,
      apiKeyTag: llmSettings.apiKeyTag,
      keyVersion: llmSettings.keyVersion,
      keyHint: llmSettings.keyHint,
      lastVerifiedAt: llmSettings.lastVerifiedAt,
      updatedAt: llmSettings.updatedAt,
    })
    .from(llmSettings)
    .where(eq(llmSettings.id, SINGLE_ROW_ID));
  return row ?? null;
}

/** Non-secret fields only: what the worker polls to decide whether to claim jobs. */
export async function findLlmSettingsSummary(
  db: Executor,
): Promise<{ provider: LlmProvider; model: string } | null> {
  const [row] = await db
    .select({ provider: llmSettings.provider, model: llmSettings.model })
    .from(llmSettings)
    .where(eq(llmSettings.id, SINGLE_ROW_ID));
  return row ?? null;
}

/** Inserts or replaces the single row; the previous ciphertext is overwritten, not kept. */
export async function upsertLlmSettings(
  db: Executor,
  row: Omit<LlmSettingsRow, 'lastVerifiedAt' | 'updatedAt'>,
): Promise<void> {
  const values = { ...row, lastVerifiedAt: sql`now()`, updatedAt: sql`now()` };
  await db
    .insert(llmSettings)
    .values({ id: SINGLE_ROW_ID, ...values })
    .onConflictDoUpdate({ target: llmSettings.id, set: values });
}
