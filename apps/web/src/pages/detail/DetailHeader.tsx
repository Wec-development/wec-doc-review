import type { DocumentDetail } from '@doc-review/shared';
import { Link } from 'react-router';
import { StatusBadge } from '../../components/StatusBadge.js';
import { UploadIcon } from '../../components/UploadIcon.js';
import { VersionSwitcher } from '../../components/VersionSwitcher.js';
import { isOlderVersion } from '../../lib/status.js';
import buttons from '../../styles/buttons.module.css';
import styles from '../Page.module.css';

interface DetailHeaderProps {
  detail: DocumentDetail;
  onUploadVersion: () => void;
}

/** Back link, title, status, versions and "Upload new version". */
export function DetailHeader({ detail, onUploadVersion }: DetailHeaderProps) {
  const older = isOlderVersion(detail);
  return (
    <>
      <Link to="/" className={styles.back}>
        ← All documents
      </Link>
      <div className={styles.detailHead}>
        <div>
          <h1 className={styles.detailH1}>{detail.document.title}</h1>
          <div className={styles.meta}>
            <StatusBadge status={detail.version.status} older={older} />
            <span>
              v{detail.version.versionNo} of {detail.document.currentVersionNo}
            </span>
          </div>
        </div>
        <div className={styles.headActions}>
          {!older && (
            <button type="button" className={buttons.secondary} onClick={onUploadVersion}>
              <UploadIcon />
              Upload new version
            </button>
          )}
          <VersionSwitcher
            documentId={detail.document.id}
            versions={detail.versions}
            selectedNo={detail.version.versionNo}
            currentNo={detail.document.currentVersionNo}
          />
        </div>
      </div>
    </>
  );
}
