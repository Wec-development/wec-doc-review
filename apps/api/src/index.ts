import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = buildApp({ db });

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down`);
  await app.close();
  await db.end();
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
