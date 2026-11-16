import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { resolveEncryptionKey } from './crypto/encryption-key.js';
import { createDb } from './db.js';
import { createDatabase } from './db/client.js';
import { LocalDiskStorage } from './storage/file-storage.js';

const config = loadConfig();
// Fails fast (before listening) if the key that protects stored API keys is unavailable.
const encryptionKey = resolveEncryptionKey({
  envKey: config.APP_ENCRYPTION_KEY,
  secretsDir: config.SECRETS_DIR,
});
const pool = createDb(config.DATABASE_URL);
const app = buildApp({
  db: createDatabase(pool),
  encryptionKey,
  storage: new LocalDiskStorage(config.STORAGE_DIR),
  options: {
    webOrigin: config.WEB_ORIGIN,
    maxUploadMb: config.MAX_UPLOAD_MB,
    trustProxy: config.TRUST_PROXY,
  },
});

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down`);
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
