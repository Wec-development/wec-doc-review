import type { DocumentSummary } from '@doc-review/shared';
import { Link } from 'react-router';
import { isInFlight } from '../lib/status.js';
import buttons from '../styles/buttons.module.css';
import styles from './DocumentsTable.module.css';
import { ProgressBar } from './ProgressBar.js';
import { StatusBadge } from './StatusBadge.js';

const TYPE_LABELS = { invoice: 'Invoice', lease: 'Lease', market_report: 'Market report' } as const;

/** "16 Nov, 15:20": short, no seconds (the full timestamp is in the detail page). */
function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface DocumentsTableProps {
  documents: DocumentSummary[];
  onRetry: (documentId: string) => void;
  retryingId: string | null;
}

function RowAction({
  document,
  onRetry,
  retryingId,
}: { document: DocumentSummary } & Omit<DocumentsTableProps, 'documents'>) {
  if (document.status === 'failed') {
    return (
      <button
        type="button"
        className={`${buttons.secondary} ${buttons.small} ${styles.actionButton}`}
        onClick={() => onRetry(document.id)}
        disabled={retryingId === document.id}
        aria-label={`Retry extraction of ${document.title}`}
      >
        Retry
      </button>
    );
  }
  if (isInFlight(document.status)) {
    return (
      <Link
        to={`/documents/${document.id}`}
        className={`${buttons.outline} ${buttons.small} ${styles.actionButton}`}
        aria-label={`View extraction progress of ${document.title}`}
      >
        View progress
      </Link>
    );
  }
  const pending = document.progress.pending;
  if (pending > 0) {
    // The one thing to do on this row, in the "pending" colour of the values it leads to.
    return (
      <Link
        to={`/documents/${document.id}`}
        className={`${buttons.base} ${buttons.small} ${styles.actionButton} ${styles.reviewButton}`}
        aria-label={`Review ${pending} values in ${document.title}`}
      >
        Review{' '}
        <span className={styles.reviewCount} aria-hidden="true">
          {pending}
        </span>
      </Link>
    );
  }
  return (
    <Link
      to={`/documents/${document.id}`}
      className={`${buttons.outline} ${buttons.small} ${styles.actionButton}`}
      aria-label={`View ${document.title}`}
    >
      View
    </Link>
  );
}

function ProgressCell({ document }: { document: DocumentSummary }) {
  if (document.status === 'failed')
    return <div className={styles.error}>{document.error ?? 'Extraction failed'}</div>;
  if (isInFlight(document.status)) {
    return (
      <>
        <div className={styles.pendingTrack} aria-hidden="true" />
        <div className={styles.muted}>Values appear when extraction finishes</div>
      </>
    );
  }
  return <ProgressBar progress={document.progress} />;
}

export function DocumentsTable({ documents, onRetry, retryingId }: DocumentsTableProps) {
  return (
    <div className={styles.box}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Type</th>
            <th scope="col">Version</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.progressCol}>
              Review progress
            </th>
            <th scope="col">
              <span className="visually-hidden">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              <td>
                <Link to={`/documents/${document.id}`} className={styles.title}>
                  {document.title}
                </Link>
                <div className={styles.sub}>Updated {formatUpdated(document.updatedAt)}</div>
              </td>
              <td className={styles.soft}>{TYPE_LABELS[document.type]}</td>
              <td>
                <span className={styles.mono}>v{document.currentVersionNo}</span>
              </td>
              <td>
                <StatusBadge status={document.status} />
              </td>
              <td>
                <ProgressCell document={document} />
              </td>
              <td className={styles.action}>
                <RowAction document={document} onRetry={onRetry} retryingId={retryingId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
