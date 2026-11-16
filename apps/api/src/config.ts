import { z } from 'zod';

/** An empty variable (e.g. `APP_ENCRYPTION_KEY=` copied from .env.example) counts as unset. */
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

/** Environment is validated once at startup so a missing variable fails fast with a clear message. */
const envSchema = z.object({
  DATABASE_URL: z.url().default('postgres://app:app@localhost:5433/app'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  // The LLM provider, model and API key are configured in the app (Settings) and stored
  // encrypted in Postgres. This key encrypts them: 32 bytes, base64. Unset: a key file in
  // SECRETS_DIR is generated on first start. Never logged.
  APP_ENCRYPTION_KEY: optionalText,
  SECRETS_DIR: z.string().min(1).default('./secrets'),
  // One LLM call may take this long before it counts as a (retryable) timeout.
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // Larger documents fail permanently instead of producing an oversized prompt.
  MAX_DOCUMENT_CHARS: z.coerce.number().int().positive().default(100_000),
  // Defaults to the repo's fixtures/ folder; containers mount it elsewhere.
  FIXTURES_DIR: z.string().min(1).optional(),
  // Uploaded PDFs; relative paths resolve against the API's working directory.
  STORAGE_DIR: z.string().min(1).default('./storage'),
  // Browser origin allowed by CORS (the review UI).
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(10),

  // Worker: how often an idle slot polls, and how many jobs run at once.
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  // On SIGTERM, in-flight jobs get this long to finish before they are released to the queue.
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),
  // A claimed job is owned for this long and renewed by heartbeats (every lease/3).
  JOB_LEASE_SECONDS: z.coerce.number().int().min(1).default(120),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  // Retry delay: base * 2^(attempt-1), with jitter, capped at 5 minutes.
  JOB_BACKOFF_BASE_MS: z.coerce.number().int().nonnegative().default(2000),

  // Which extractor the worker uses: `llm` (provider and key from Settings; the worker waits
  // until they are configured) or `fake` (deterministic values, for demos without a key).
  EXTRACTOR: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['fake', 'llm']).default('llm'),
  ),
  // Fake extractor only: outcome and simulated duration (useful for crash and retry testing).
  FAKE_EXTRACTOR_BEHAVIOR: z.enum(['succeed', 'retryable', 'permanent']).default('succeed'),
  FAKE_EXTRACTOR_DELAY_MS: z.coerce.number().int().nonnegative().default(1500),
});

const configSchema = envSchema;

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
