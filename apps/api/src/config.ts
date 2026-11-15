import { z } from 'zod';

/** Environment is validated once at startup so a missing variable fails fast with a clear message. */
const envSchema = z.object({
  DATABASE_URL: z.url().default('postgres://app:app@localhost:5433/app'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
