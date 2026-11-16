import { createHash } from 'node:crypto';
import { resolveEncryptionKey } from '../../src/crypto/encryption-key.js';

/**
 * Run as a separate process by the key-race test: at <startAtMs> it resolves the key and prints
 * only a fingerprint (never the key), so concurrent processes can be compared.
 */
const [secretsDir, startAtArg] = process.argv.slice(2);
if (!secretsDir || !startAtArg) throw new Error('usage: resolve-key.ts <secretsDir> <startAtMs>');

// Barrier: every process waits for the same instant, so they race for the file for real
// instead of being spread out by their different start-up times.
const startAt = Number(startAtArg);
while (Date.now() < startAt) {
  // busy-wait: a timer would add scheduling jitter of its own
}
const key = resolveEncryptionKey({ secretsDir });
process.stdout.write(createHash('sha256').update(key).digest('hex'));
