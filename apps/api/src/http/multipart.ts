import type { FastifyRequest } from 'fastify';
import { UnsupportedMediaTypeError, ValidationError } from '../errors.js';
import { assertPdf } from '../uploads/pdf.js';
import type { PdfUpload } from '../services/documents.service.js';

export const FILE_FIELD = 'file';

export interface PdfForm {
  fields: Record<string, string>;
  file: PdfUpload;
}

/**
 * Reads a multipart form with exactly one PDF in the `file` part. The size limit is enforced by
 * @fastify/multipart while buffering (413); the media type and %PDF- signature are checked here
 * (415).
 */
export async function readPdfForm(request: FastifyRequest): Promise<PdfForm> {
  if (!request.isMultipart()) {
    throw new UnsupportedMediaTypeError('Expected a multipart/form-data upload');
  }

  const fields: Record<string, string> = {};
  let upload: { contents: Buffer; mediaType: string; filename: string } | undefined;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== FILE_FIELD) {
        throw new ValidationError(`Unexpected file field "${part.fieldname}"; use "${FILE_FIELD}"`);
      }
      upload = {
        contents: await part.toBuffer(),
        mediaType: part.mimetype,
        filename: part.filename,
      };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }

  if (!upload) {
    throw new ValidationError(`A PDF is required in the "${FILE_FIELD}" field`, [
      { path: FILE_FIELD, message: 'Required' },
    ]);
  }
  assertPdf(upload.mediaType, upload.contents);
  return { fields, file: { contents: upload.contents, filename: upload.filename } };
}
