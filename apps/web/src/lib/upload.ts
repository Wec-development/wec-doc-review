import { ApiError } from '../api/client.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Client-side check before anything is sent; null when the file is acceptable. */
export function validatePdf(file: File | null): string | null {
  if (!file) return 'Choose a PDF file to upload.';
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Only PDF files are supported.';
  if (file.size > MAX_UPLOAD_BYTES) return 'File too large — the limit is 10 MB.';
  return null;
}

/** Server errors for an upload, in the reviewer's terms. */
export function uploadErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Upload failed. Please try again.';
  switch (error.status) {
    case 415:
      return 'Only PDF files are supported.';
    case 413:
      return 'File too large — the limit is 10 MB.';
    case 409:
      return 'Identical to current version — choose a different file.';
    default:
      return error.message;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
