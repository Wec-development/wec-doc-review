import { createHash } from 'node:crypto';
import { UnsupportedMediaTypeError } from '../errors.js';

const PDF_MEDIA_TYPE = 'application/pdf';
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');

/** True only when the bytes start with the PDF signature; the declared type alone is not trusted. */
export function hasPdfSignature(contents: Buffer): boolean {
  return contents.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

export function assertPdf(mediaType: string, contents: Buffer): void {
  if (mediaType !== PDF_MEDIA_TYPE) {
    throw new UnsupportedMediaTypeError(`Expected ${PDF_MEDIA_TYPE}, got ${mediaType}`);
  }
  if (!hasPdfSignature(contents)) {
    throw new UnsupportedMediaTypeError('File is not a PDF (missing %PDF- header)');
  }
}

export function sha256Hex(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}
