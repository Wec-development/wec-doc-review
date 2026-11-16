import type { DocumentType } from '@doc-review/shared';
import { type FormEvent, useRef, useState } from 'react';
import { useUploadDocument, useUploadVersion } from '../api/queries.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { formatBytes, uploadErrorMessage, validatePdf } from '../lib/upload.js';
import buttons from '../styles/buttons.module.css';
import { useAnnounce } from './Announcer.js';
import { NewDocumentFields } from './NewDocumentFields.js';
import styles from './UploadDialog.module.css';

export type UploadMode =
  { kind: 'document' } | { kind: 'version'; documentId: string; title: string };

interface UploadDialogProps {
  mode: UploadMode;
  onClose: () => void;
}

/** Upload a new document, or a new version of one (Upload.dc.html). */
export function UploadDialog({ mode, onClose }: UploadDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, onClose);
  const announce = useAnnounce();
  const uploadDocument = useUploadDocument();
  const uploadVersion = useUploadVersion(mode.kind === 'version' ? mode.documentId : '');
  const [type, setType] = useState<DocumentType>('invoice');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const mutation = mode.kind === 'version' ? uploadVersion : uploadDocument;
  const error = clientError ?? (mutation.error ? uploadErrorMessage(mutation.error) : null);
  const heading = mode.kind === 'version' ? 'Upload a new version' : 'Upload a document';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validatePdf(file);
    setClientError(problem);
    if (problem || !file) return;
    try {
      if (mode.kind === 'version') await uploadVersion.mutateAsync(file);
      else await uploadDocument.mutateAsync({ type, title: title.trim() || undefined, file });
      announce('Uploaded — extraction started');
      onClose();
    } catch {
      // The error is shown inline from the mutation state.
    }
  };

  return (
    <div className={styles.backdrop}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <div className={styles.head}>
          <h2 id="upload-title" className={styles.title}>
            {heading}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {mode.kind === 'version' ? (
            <p className={styles.hint}>
              New version of <strong>{mode.title}</strong>. Unchanged values keep their review.
            </p>
          ) : (
            <NewDocumentFields
              type={type}
              title={title}
              onTypeChange={setType}
              onTitleChange={setTitle}
            />
          )}
          <div className={styles.field}>
            <label htmlFor="doc-file">
              PDF file <span className={styles.required}>*</span>
            </label>
            <input
              id="doc-file"
              type="file"
              accept="application/pdf,.pdf"
              aria-describedby="doc-file-hint"
              aria-invalid={error !== null}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setClientError(null);
                mutation.reset();
              }}
            />
            <div id="doc-file-hint" className={styles.hintSmall}>
              PDF only · up to 10 MB{file ? ` · ${file.name} (${formatBytes(file.size)})` : ''}
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>
          <p className={styles.hint}>
            Upload returns immediately. Extraction runs in the background and the status updates in
            the list.
          </p>
          <div className={styles.actions}>
            <button type="button" className={buttons.secondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={buttons.primary} disabled={mutation.isPending}>
              {mutation.isPending ? 'Uploading…' : 'Upload and extract'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
