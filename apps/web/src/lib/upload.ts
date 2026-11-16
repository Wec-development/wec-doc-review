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

export type UploadStatus = 'ready' | 'invalid' | 'uploading' | 'uploaded' | 'failed';

/** One chosen file and where it is in the upload. */
export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  /** Why the file is invalid or why its upload failed. */
  message: string | null;
}

/** Same name, size and modification time: the same file chosen twice. */
function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Adds chosen or dropped files to the list, validating each one. Duplicates are ignored; in
 * single-file mode the new file replaces the current one.
 */
export function addFiles(
  items: readonly UploadItem[],
  files: readonly File[],
  options: { multiple: boolean; nextId: () => string },
): UploadItem[] {
  const toItem = (file: File): UploadItem => {
    const problem = validatePdf(file);
    return {
      id: options.nextId(),
      file,
      status: problem ? 'invalid' : 'ready',
      message: problem,
    };
  };
  if (!options.multiple) {
    const [first] = files;
    return first ? [toItem(first)] : [...items];
  }
  const added: UploadItem[] = [];
  for (const file of files) {
    const known = [...items, ...added].some((item) => sameFile(item.file, file));
    if (!known) added.push(toItem(file));
  }
  return [...items, ...added];
}

/** The problem that blocks submitting, in the reviewer's terms; null when all files are fine. */
export function blockingProblem(items: readonly UploadItem[]): string | null {
  if (items.length === 0) return 'Choose a PDF file to upload.';
  const invalid = items.filter((item) => item.status === 'invalid');
  const [first] = invalid;
  if (!first) return null;
  if (items.length === 1) return first.message;
  return invalid.length === 1
    ? `${first.file.name}: ${first.message ?? 'invalid file'} Remove it to continue.`
    : `${invalid.length} files can't be uploaded (PDF only, up to 10 MB). Remove them to continue.`;
}

/** Label of the submit button for the files still to upload. */
export function submitLabel(pending: number): string {
  return pending > 1 ? `Upload ${pending} documents` : 'Upload and extract';
}
