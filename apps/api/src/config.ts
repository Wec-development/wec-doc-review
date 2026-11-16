import { z } from 'zod';

/** Environment is validated once at startup so a missing variable fails fast with a clear message. */
const envSchema = z.object({
  DATABASE_URL: z.url().default('postgres://app:app@localhost:5433/app'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
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

  // Which extractor the worker uses. `llm` is implemented in Step 6.
  EXTRACTOR: z.enum(['fake', 'llm']).default('fake'),
  // Fake extractor only: outcome and simulated duration (useful for crash and retry testing).
  FAKE_EXTRACTOR_BEHAVIOR: z.enum(['succeed', 'retryable', 'permanent']).default('succeed'),
  FAKE_EXTRACTOR_DELAY_MS: z.coerce.number().int().nonnegative().default(1500),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
