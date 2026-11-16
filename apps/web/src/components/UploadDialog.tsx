import type { DocumentType } from '@doc-review/shared';
import { type FormEvent, useRef, useState } from 'react';
import { useUploadDocument, useUploadVersion } from '../api/queries.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import {
  addFiles,
  blockingProblem,
  submitLabel,
  type UploadItem,
  uploadErrorMessage,
} from '../lib/upload.js';
import buttons from '../styles/buttons.module.css';
import { useAnnounce } from './Announcer.js';
import { FileDropZone } from './FileDropZone.js';
import { NewDocumentFields } from './NewDocumentFields.js';
import styles from './UploadDialog.module.css';
import { UploadDialogHeader } from './UploadDialogHeader.js';
import { UploadFileList } from './UploadFileList.js';

export type UploadMode =
  { kind: 'document' } | { kind: 'version'; documentId: string; title: string };

interface UploadDialogProps {
  mode: UploadMode;
  onClose: () => void;
}

const isPending = (item: UploadItem) => item.status !== 'uploaded';

/**
 * Upload new documents (one or several PDFs, each its own document) or a new version of one
 * document (a single PDF). Files upload one after another; each shows its own status.
 */
export function UploadDialog({ mode, onClose }: UploadDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, onClose);
  const announce = useAnnounce();
  const uploadDocument = useUploadDocument();
  const uploadVersion = useUploadVersion(mode.kind === 'version' ? mode.documentId : '');
  const [type, setType] = useState<DocumentType>('invoice');
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);

  const multiple = mode.kind === 'document';
  const pending = items.filter(isPending);
  const single = items.length <= 1;
  const update = (id: string, change: Partial<UploadItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const onFiles = (files: File[]) => {
    setItems((current) =>
      addFiles(current, files, { multiple, nextId: () => `file-${(nextId.current += 1)}` }),
    );
    setError(null);
  };

  const upload = (file: File) =>
    mode.kind === 'version'
      ? uploadVersion.mutateAsync(file)
      : uploadDocument.mutateAsync({ type, title: (single && title.trim()) || undefined, file });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = blockingProblem(pending);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const failures: string[] = [];
    for (const item of pending) {
      update(item.id, { status: 'uploading', message: null });
      try {
        await upload(item.file);
        update(item.id, { status: 'uploaded', message: null });
      } catch (uploadError) {
        const message = uploadErrorMessage(uploadError);
        failures.push(message);
        update(item.id, { status: 'failed', message });
      }
    }
    setBusy(false);
    const uploaded = pending.length - failures.length;
    if (failures.length === 0) {
      announce(
        uploaded === 1
          ? 'Uploaded — extraction started'
          : `${uploaded} documents uploaded — extraction started`,
      );
      onClose();
      return;
    }
    setError(
      pending.length === 1
        ? (failures[0] ?? null)
        : `${failures.length} of ${pending.length} uploads failed. ${uploaded} uploaded; fix or remove the others and try again.`,
    );
  };

  return (
    <div className={styles.backdrop}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        aria-describedby="upload-intro"
      >
        <UploadDialogHeader mode={mode} onClose={onClose} />
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.body}>
            {mode.kind === 'document' && (
              <NewDocumentFields
                type={type}
                title={title}
                showTitle={single}
                onTypeChange={setType}
                onTitleChange={setTitle}
              />
            )}
            <FileDropZone multiple={multiple} invalid={error !== null} onFiles={onFiles} />
            <UploadFileList
              items={items}
              busy={busy}
              onRemove={(id) => {
                setItems((current) => current.filter((item) => item.id !== id));
                setError(null);
              }}
              onClear={() => {
                setItems([]);
                setError(null);
              }}
            />
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className={styles.actions}>
            <p className={styles.footnote}>
              Upload returns immediately; status updates in the list.
            </p>
            <button type="button" className={buttons.secondary} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={buttons.primary} disabled={busy}>
              {busy ? 'Uploading…' : submitLabel(pending.length)}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
