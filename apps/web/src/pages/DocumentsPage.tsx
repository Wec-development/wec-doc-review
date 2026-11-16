import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../api/client.js';
import { useDocuments, useRetry } from '../api/queries.js';
import { useAnnounce } from '../components/Announcer.js';
import { DocumentsTable } from '../components/DocumentsTable.js';
import { EmptyState } from '../components/EmptyState.js';
import { Pagination } from '../components/Pagination.js';
import { ErrorState } from '../components/ErrorState.js';
import { LlmPausedBanner } from '../components/LlmPausedBanner.js';
import { Skeleton } from '../components/Skeleton.js';
import { SummaryCards } from '../components/SummaryCards.js';
import { UploadDialog } from '../components/UploadDialog.js';
import { UploadIcon } from '../components/UploadIcon.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { DOCUMENTS_PER_PAGE, paginate, parsePage } from '../lib/pagination.js';
import { listSubtitle, listTotals } from '../lib/summary.js';
import buttons from '../styles/buttons.module.css';
import styles from './Page.module.css';

/**
 * After moving to another page (the links sit below the table), bring the top of the table back
 * into view. Not on first load, and only if the reader had scrolled past it.
 */
function useScrollToTableOnPageChange(page: number) {
  const tableTop = useRef<HTMLDivElement>(null);
  const shownPage = useRef(page);
  useEffect(() => {
    if (shownPage.current === page) return;
    shownPage.current = page;
    const target = tableTop.current;
    if (target && target.getBoundingClientRect().top < 0) {
      target.scrollIntoView({ block: 'start' });
    }
  }, [page]);
  return tableTop;
}

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
  // Totals (cards, subtitle) cover every document; the table shows one page of 25.
  const totals = listTotals(list);
  const [searchParams] = useSearchParams();
  const current = paginate(list, parsePage(searchParams.get('page')), DOCUMENTS_PER_PAGE);
  const tableTop = useScrollToTableOnPageChange(current.page);

  return (
    <main className={styles.main}>
      <LlmPausedBanner />
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
          <div ref={tableTop} className={styles.scrollTarget} />
          <DocumentsTable
            documents={current.items}
            onRetry={onRetry}
            retryingId={retry.isPending ? (retry.variables ?? null) : null}
          />
          <Pagination
            page={current.page}
            pageCount={current.pageCount}
            from={current.from}
            to={current.to}
            total={current.total}
            hrefFor={(page) => (page === 1 ? '/' : `/?page=${page}`)}
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
