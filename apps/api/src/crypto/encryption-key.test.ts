import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EncryptionKeyError, resolveEncryptionKey } from './encryption-key.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'doc-review-secrets-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveEncryptionKey', () => {
  it('uses APP_ENCRYPTION_KEY when set, and never touches the secrets dir', () => {
    const envKey = randomBytes(32);
    const dir = path.join(tempDir(), 'unused');

    const key = resolveEncryptionKey({ envKey: envKey.toString('base64'), secretsDir: dir });

    expect(key.equals(envKey)).toBe(true);
    expect(() => statSync(dir)).toThrow();
  });

  it('rejects an APP_ENCRYPTION_KEY that is not 32 bytes', () => {
    expect(() =>
      resolveEncryptionKey({ envKey: randomBytes(16).toString('base64'), secretsDir: tempDir() }),
    ).toThrow(/APP_ENCRYPTION_KEY must be 32 bytes/);
  });

  it('generates the key file once with mode 0600 and reuses it', () => {
    const dir = path.join(tempDir(), 'secrets');

    const first = resolveEncryptionKey({ secretsDir: dir });
    const second = resolveEncryptionKey({ envKey: '', secretsDir: dir });

    const file = path.join(dir, 'encryption.key');
    expect(first).toHaveLength(32);
    expect(second.equals(first)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(Buffer.from(readFileSync(file, 'utf8').trim(), 'base64').equals(first)).toBe(true);
  });

  it('fails fast with a clear message when the key cannot be created', () => {
    const parent = tempDir();
    chmodSync(parent, 0o500); // read-only: the secrets dir cannot be created

    expect(() => resolveEncryptionKey({ secretsDir: path.join(parent, 'secrets') })).toThrow(
      /Cannot create the encryption key .* set APP_ENCRYPTION_KEY or make SECRETS_DIR writable/,
    );
  });

  it('fails fast when the key file exists but is unreadable or corrupt', () => {
    const dir = tempDir();
    const file = path.join(dir, 'encryption.key');
    writeFileSync(file, 'not-a-key\n', { mode: 0o600 });
    expect(() => resolveEncryptionKey({ secretsDir: dir })).toThrow(EncryptionKeyError);

    chmodSync(file, 0o000);
    expect(() => resolveEncryptionKey({ secretsDir: dir })).toThrow(
      /Cannot read the encryption key/,
    );
  });
});
