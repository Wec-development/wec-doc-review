import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_KEY_VERSION,
  DecryptionError,
  decryptSecret,
  encryptSecret,
} from './secret-box.js';

const KEY = randomBytes(32);
const SECRET = 'sk-ant-test-0123456789abcdefghij';

function flipFirstByte(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  copy[0] = (copy[0] ?? 0) ^ 0xff;
  return copy;
}

describe('encryptSecret / decryptSecret (AES-256-GCM)', () => {
  it('round-trips, with a fresh 12-byte IV, a 16-byte tag and the key version', () => {
    const encrypted = encryptSecret(SECRET, KEY);

    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.tag).toHaveLength(16);
    expect(encrypted.keyVersion).toBe(CURRENT_KEY_VERSION);
    expect(encrypted.ciphertext.toString('utf8')).not.toContain(SECRET);
    expect(decryptSecret(encrypted, KEY)).toBe(SECRET);
  });

  it('never reuses an IV, so the same secret encrypts differently each time', () => {
    const first = encryptSecret(SECRET, KEY);
    const second = encryptSecret(SECRET, KEY);
    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it.each(['ciphertext', 'iv', 'tag'] as const)('rejects a tampered %s', (part) => {
    const encrypted = encryptSecret(SECRET, KEY);
    const tampered = { ...encrypted, [part]: flipFirstByte(encrypted[part]) };
    expect(() => decryptSecret(tampered, KEY)).toThrow(DecryptionError);
  });

  it('rejects decryption with a different encryption key, without leaking details', () => {
    const encrypted = encryptSecret(SECRET, KEY);
    const error = (() => {
      try {
        decryptSecret(encrypted, randomBytes(32));
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(DecryptionError);
    expect(String(error)).not.toContain(SECRET);
  });

  it('refuses a key of the wrong length', () => {
    expect(() => encryptSecret(SECRET, randomBytes(16))).toThrow(/32 bytes/);
  });
});
