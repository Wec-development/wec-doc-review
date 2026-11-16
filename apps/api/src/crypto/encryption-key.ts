import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const KEY_BYTES = 32;
const KEY_FILE = 'encryption.key';

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionKeyError';
  }
}

function decodeEnvKey(value: string): Buffer {
  const key = Buffer.from(value.trim(), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(
      `APP_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64-encoded (generate one with: openssl rand -base64 32)`,
    );
  }
  return key;
}

function readKeyFile(file: string): Buffer {
  const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(`${file} does not contain a ${KEY_BYTES}-byte base64 key`);
  }
  return key;
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

/** Creates the key file exclusively (mode 0600), so concurrent first starts agree on one key. */
function createKeyFile(dir: string, file: string): Buffer {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(file, `${randomBytes(KEY_BYTES).toString('base64')}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    // Another process (API or worker) created it first: use theirs.
    if (!isErrno(error, 'EEXIST')) throw error;
  }
  return readKeyFile(file);
}

/**
 * The key that encrypts stored secrets; it never lives in the database. Order:
 * 1. APP_ENCRYPTION_KEY (32 bytes, base64), when set;
 * 2. SECRETS_DIR/encryption.key, generated on first start with mode 0600.
 * Fails fast with a clear message when neither works. The key is never logged.
 */
export function resolveEncryptionKey(input: { envKey?: string; secretsDir: string }): Buffer {
  if (input.envKey !== undefined && input.envKey.trim() !== '') {
    return decodeEnvKey(input.envKey);
  }
  const dir = path.resolve(input.secretsDir);
  const file = path.join(dir, KEY_FILE);
  try {
    return readKeyFile(file);
  } catch (error) {
    if (error instanceof EncryptionKeyError) throw error;
    if (!isErrno(error, 'ENOENT')) {
      throw new EncryptionKeyError(
        `Cannot read the encryption key at ${file}; set APP_ENCRYPTION_KEY or fix the file's permissions`,
      );
    }
  }
  try {
    return createKeyFile(dir, file);
  } catch (error) {
    if (error instanceof EncryptionKeyError) throw error;
    throw new EncryptionKeyError(
      `Cannot create the encryption key at ${file}; set APP_ENCRYPTION_KEY or make SECRETS_DIR writable`,
    );
  }
}
