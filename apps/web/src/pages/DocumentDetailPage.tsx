import type { DocumentDetail, VersionStatus } from '@doc-review/shared';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ApiError, errorMessage } from '../api/client.js';
import {
  detailRefetchInterval,
  useDocument,
  useProgress,
  useRefreshProgressOnStatusChange,
  useRetry,
} from '../api/queries.js';
import { useAnnounce } from '../components/Announcer.js';
import { ErrorState } from '../components/ErrorState.js';
import { Skeleton } from '../components/Skeleton.js';
import { UploadDialog } from '../components/UploadDialog.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { isInFlight, isOlderVersion } from '../lib/status.js';
import { DetailExtracting } from './detail/DetailExtracting.js';
import { DetailFailed } from './detail/DetailFailed.js';
import { DetailHeader } from './detail/DetailHeader.js';
import { DetailReadOnly } from './detail/DetailReadOnly.js';
import { DetailReview } from './detail/DetailReview.js';
import { NotFoundPage } from './NotFoundPage.js';
import styles from './Page.module.css';

function parseVersion(raw: string | null): number | 'invalid' | undefined {
  if (raw === null) return undefined;
  const version = Number(raw);
  return Number.isInteger(version) && version > 0 ? version : 'invalid';
}

/** Announces extraction finishing or failing while the reviewer watches the page. */
function useStatusAnnouncements(detail: DocumentDetail | undefined) {
  const announce = useAnnounce();
  const previous = useRef<VersionStatus | undefined>(undefined);
  const status = detail?.version.status;
  useEffect(() => {
    const wasInFlight = previous.current !== undefined && isInFlight(previous.current);
    if (wasInFlight && status === 'extracted')
      announce('Extraction finished — values are ready for review');
    if (wasInFlight && status === 'failed') announce('Extraction failed');
    previous.current = status;
  }, [status, announce]);
}

/** `/documents/:id[?version=N]`: extracting, failed, review, or a read-only older version. */
export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const parsed = parseVersion(searchParams.get('version'));
  const version = parsed === 'invalid' ? undefined : parsed;
  const valid = parsed !== 'invalid';

  const detail = useDocument(id, version, valid);
  const polling = detailRefetchInterval(detail.data) !== false;
  const progress = useProgress(id, version, polling, valid);
  useRefreshProgressOnStatusChange(id, detail.data?.version.status);
  const retry = useRetry();
  const [uploading, setUploading] = useState(false);
  useStatusAnnouncements(detail.data);
  usePageTitle(
    detail.data ? `${detail.data.document.title} · v${detail.data.version.versionNo}` : 'Document',
  );

  const notFound = !valid || (detail.error instanceof ApiError && detail.error.status === 404);
  if (notFound) return <NotFoundPage what="document or version" />;

  const data = detail.data;
  const older = data ? isOlderVersion(data) : false;

  return (
    <main className={styles.detailMain}>
      {detail.isPending && <Skeleton rows={3} label="Loading document" />}
      {detail.isError && (
        <ErrorState message={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />
      )}
      {data && (
        <>
          <DetailHeader detail={data} onUploadVersion={() => setUploading(true)} />
          {older && <DetailReadOnly detail={data} />}
          {!older && isInFlight(data.version.status) && (
            <DetailExtracting status={data.version.status} />
          )}
          {!older && data.version.status === 'failed' && (
            <DetailFailed
              error={data.version.error}
              retrying={retry.isPending}
              retryError={retry.isError ? errorMessage(retry.error) : null}
              onRetry={() => retry.mutate(data.document.id)}
              onUploadVersion={() => setUploading(true)}
            />
          )}
          {!older && data.version.status === 'extracted' && (
            <DetailReview detail={data} progress={progress.data} />
          )}
          {uploading && (
            <UploadDialog
              mode={{ kind: 'version', documentId: data.document.id, title: data.document.title }}
              onClose={() => setUploading(false)}
            />
          )}
        </>
      )}
    </main>
  );
}
