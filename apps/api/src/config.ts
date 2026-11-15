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
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
