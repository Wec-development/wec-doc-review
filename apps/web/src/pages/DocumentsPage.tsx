import { useState } from 'react';
import { errorMessage } from '../api/client.js';
import { useDocuments, useRetry } from '../api/queries.js';
import { useAnnounce } from '../components/Announcer.js';
import { DocumentsTable } from '../components/DocumentsTable.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { Skeleton } from '../components/Skeleton.js';
import { SummaryCards } from '../components/SummaryCards.js';
import { UploadDialog } from '../components/UploadDialog.js';
import { UploadIcon } from '../components/UploadIcon.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { listSubtitle, listTotals } from '../lib/summary.js';
import buttons from '../styles/buttons.module.css';
import styles from './Page.module.css';

/** `/`: every document with its status and review progress (Main / Empty mockups). */
export function DocumentsPage() {
  usePageTitle('Documents');
  const documents = useDocuments();
  const retry = useRetry();
  const announce = useAnnounce();
  const [uploading, setUploading] = useState(false);

  const onRetry = (documentId: string) =>
    retry.mutate(documentId, {
      onSuccess: () => announce('Extraction restarted'),
      onError: (error) => announce(`Retry failed: ${errorMessage(error)}`),
    });

  const list = documents.data?.documents ?? [];
  const totals = listTotals(list);

  return (
    <main className={styles.main}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.h1}>Documents</h1>
          {documents.isSuccess && list.length > 0 && (
            <p className={styles.subtitle}>{listSubtitle(totals)}</p>
          )}
        </div>
        <button type="button" className={buttons.primary} onClick={() => setUploading(true)}>
          <UploadIcon />
          Upload PDF
        </button>
      </div>

      {documents.isPending && <Skeleton rows={3} label="Loading documents" />}
      {documents.isError && (
        <ErrorState
          message={errorMessage(documents.error)}
          onRetry={() => void documents.refetch()}
        />
      )}
      {documents.isSuccess && list.length === 0 && (
        <EmptyState onUpload={() => setUploading(true)} />
      )}
      {documents.isSuccess && list.length > 0 && (
        <>
          <SummaryCards totals={totals} />
          <DocumentsTable
            documents={list}
            onRetry={onRetry}
            retryingId={retry.isPending ? (retry.variables ?? null) : null}
          />
          <p className={styles.footnote}>
            The list refreshes every 3 s while any document is queued or extracting; polling stops
            when all are settled.
          </p>
        </>
      )}

      {uploading && (
        <UploadDialog mode={{ kind: 'document' }} onClose={() => setUploading(false)} />
      )}
    </main>
  );
}
