import { describe, expect, it } from 'vitest';
import { UnsupportedMediaTypeError } from '../errors.js';
import { assertPdf, hasPdfSignature, sha256Hex } from './pdf.js';

describe('PDF upload checks', () => {
  it('recognises the %PDF- signature', () => {
    expect(hasPdfSignature(Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(hasPdfSignature(Buffer.from('%PD'))).toBe(false);
    expect(hasPdfSignature(Buffer.from('GIF89a'))).toBe(false);
  });

  it('requires both the PDF media type and the signature', () => {
    const pdf = Buffer.from('%PDF-1.4');
    expect(() => assertPdf('application/pdf', pdf)).not.toThrow();
    expect(() => assertPdf('application/octet-stream', pdf)).toThrow(UnsupportedMediaTypeError);
    expect(() => assertPdf('application/pdf', Buffer.from('hello'))).toThrow(
      UnsupportedMediaTypeError,
    );
  });

  it('hashes contents as lowercase hex SHA-256', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
