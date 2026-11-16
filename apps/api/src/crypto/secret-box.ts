import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
/** Bumped when the encryption key is rotated; stored with every ciphertext. */
export const CURRENT_KEY_VERSION = 1;

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

/** Thrown when a secret cannot be decrypted (tampered data or a different encryption key). */
export class DecryptionError extends Error {
  constructor() {
    super('Stored secret could not be decrypted (wrong encryption key or tampered data)');
    this.name = 'DecryptionError';
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes`);
  }
}

/** AES-256-GCM with a fresh random 12-byte IV per call; the auth tag detects any tampering. */
export function encryptSecret(plaintext: string, key: Buffer): EncryptedSecret {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: CURRENT_KEY_VERSION };
}

/** Decrypts at the moment of use; callers must not keep the plaintext beyond that use. */
export function decryptSecret(secret: Omit<EncryptedSecret, 'keyVersion'>, key: Buffer): string {
  assertKey(key);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, secret.iv);
    decipher.setAuthTag(secret.tag);
    return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Never surface the underlying error: it carries nothing useful and must not leak data.
    throw new DecryptionError();
  }
}
