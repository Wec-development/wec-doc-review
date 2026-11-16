import type { ExtractedValue } from '@doc-review/shared';
import { lineOfOffset } from '../lib/highlight.js';
import styles from './Values.module.css';

interface EvidenceQuoteProps {
  value: ExtractedValue;
  versionNo: number;
  parsedText: string | null;
  /** Scrolls the document text to this quote; omitted when there is no text panel. */
  onShow?: () => void;
}

/** The exact passage the value came from ("Source quote · v2, line 7"). */
export function EvidenceQuote({ value, versionNo, parsedText, onShow }: EvidenceQuoteProps) {
  if (value.evidence === null) return null;
  const line =
    parsedText !== null && value.evidenceStart !== null
      ? lineOfOffset(parsedText, value.evidenceStart)
      : null;
  const canShow = onShow !== undefined && value.evidenceStart !== null && parsedText !== null;
  return (
    <div className={styles.quoteBox}>
      <div className={styles.quoteLabel}>
        Source quote · v{versionNo}
        {line !== null ? `, line ${line}` : ''}
      </div>
      <div className={styles.quote}>
        <mark className={styles.quoteMark}>{value.evidence}</mark>
      </div>
      {canShow && (
        <button type="button" className={styles.linkButton} onClick={onShow}>
          Show in document text
        </button>
      )}
    </div>
  );
}
