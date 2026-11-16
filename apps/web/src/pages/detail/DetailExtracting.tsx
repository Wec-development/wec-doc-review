import type { DocumentDetail } from '@doc-review/shared';
import { api } from '../../api/client.js';
import { ExtractionBanner } from '../../components/extracting/ExtractionBanner.js';
import { ExtractionProgress } from '../../components/extracting/ExtractionProgress.js';
import { PdfPanel } from '../../components/extracting/PdfPanel.js';
import { StickyBar } from '../../components/StickyBar.js';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../../hooks/useMediaQuery.js';
import styles from '../Page.module.css';

/**
 * Queued or extracting (Extracting.dc.html): the same layout as review, so the page does not
 * jump when values arrive. A sticky status bar, the extraction steps on the left, and the
 * uploaded PDF itself on the right while the page polls.
 */
export function DetailExtracting({ detail }: { detail: DocumentDetail }) {
  const { document: doc, version } = detail;
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  return (
    <>
      <StickyBar>
        <ExtractionBanner status={version.status} versionNo={version.versionNo} />
      </StickyBar>
      <div className={styles.columns}>
        <ExtractionProgress
          status={version.status}
          versionNo={version.versionNo}
          retryNote={version.status === 'queued' ? version.error : null}
        />
        <PdfPanel
          url={api.fileUrl(doc.id, version.versionNo)}
          versionNo={version.versionNo}
          sticky={wide}
        />
      </div>
    </>
  );
}
