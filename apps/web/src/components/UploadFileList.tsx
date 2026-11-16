import { formatBytes, type UploadItem } from '../lib/upload.js';
import styles from './UploadDialog.module.css';

const PROBLEM_LABEL: Partial<Record<UploadItem['status'], string>> = {
  invalid: "Can't upload",
  failed: 'Failed',
};

interface UploadFileListProps {
  items: readonly UploadItem[];
  busy: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
}

function FileIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One line about the selection: what is chosen, or how the upload is going. */
function summaryText(items: readonly UploadItem[]): string {
  const count = (status: UploadItem['status']) =>
    items.filter((item) => item.status === status).length;
  const total = items.reduce((bytes, item) => bytes + item.file.size, 0);
  const [only] = items;
  if (count('uploading') > 0) {
    return `Uploading ${count('uploaded') + 1} of ${items.length}…`;
  }
  if (count('uploaded') > 0) {
    return `${count('uploaded')} uploaded · ${count('failed') + count('invalid')} not uploaded`;
  }
  if (items.length === 1 && only) return `${only.file.name} · ${formatBytes(total)}`;
  return `${plural(items.length, 'PDF', 'PDFs')} selected · ${formatBytes(total)}`;
}

/**
 * The selection as a count, not a list: only files with a problem (not a PDF, too large, or a
 * failed upload) get their own row, so the reviewer can see why and remove them.
 */
export function UploadFileList({ items, busy, onRemove, onClear }: UploadFileListProps) {
  if (items.length === 0) return null;
  const problems = items.filter((item) => PROBLEM_LABEL[item.status] !== undefined);
  return (
    <div className={styles.selection}>
      <div className={styles.summary} role="status">
        <span className={styles.fileIcon}>
          <FileIcon />
        </span>
        <span className={styles.summaryText}>{summaryText(items)}</span>
        {!busy && (
          <button
            type="button"
            className={styles.clear}
            onClick={onClear}
            aria-label={items.length === 1 ? 'Remove the file' : 'Remove all files'}
          >
            {items.length === 1 ? 'Remove' : 'Clear'}
          </button>
        )}
      </div>
      {problems.length > 0 && (
        <ul className={styles.fileList} aria-label="Files that need attention">
          {problems.map((item) => (
            <li key={item.id} className={`${styles.fileRow} ${styles[item.status] ?? ''}`}>
              <span className={styles.fileIcon}>
                <FileIcon />
              </span>
              <span className={styles.fileInfo}>
                <span className={styles.fileName}>{item.file.name}</span>
                <span className={styles.fileMeta}>
                  {PROBLEM_LABEL[item.status]}
                  {item.message ? ` — ${item.message}` : ''}
                </span>
              </span>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${item.file.name}`}
                onClick={() => onRemove(item.id)}
                disabled={busy}
              >
                <svg
                  width="16"
                  height="16"
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
