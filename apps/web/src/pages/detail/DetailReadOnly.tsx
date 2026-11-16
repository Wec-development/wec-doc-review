import type { DocumentDetail } from '@doc-review/shared';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { DocumentText } from '../../components/DocumentText.js';
import { ReviewedRow } from '../../components/ReviewedRow.js';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../../hooks/useMediaQuery.js';
import { fieldKind } from '../../lib/format-value.js';
import { valueHighlights } from '../../lib/highlight.js';
import styles from '../Page.module.css';

/** An older version: its values, reviews and text exactly as they were, no actions (OldVersion). */
export function DetailReadOnly({ detail }: { detail: DocumentDetail }) {
  const { version, document: doc } = detail;
  const ranges = useMemo(() => valueHighlights(detail.values, true), [detail.values]);
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);

  return (
    <>
      <section className={styles.notice} aria-label="Read-only version">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <div className={styles.noticeText}>
          <strong>Viewing version {version.versionNo} — read-only.</strong> It was superseded by
          version {doc.currentVersionNo}. Values and reviews are kept exactly as they were.
        </div>
        <Link to={`/documents/${doc.id}`}>Go to current version</Link>
      </section>
      <div className={styles.columns}>
        <section
          className={styles.valuesColumn}
          aria-label={`Values in version ${version.versionNo}`}
        >
          {detail.values.length === 0 ? (
            <p className={styles.subtitle}>No values were extracted for this version.</p>
          ) : (
            <div className={styles.rows}>
              {detail.values.map((value) => (
                <ReviewedRow
                  key={value.id}
                  value={value}
                  display={{
                    kind: fieldKind(doc.type, value.field),
                    versionNo: version.versionNo,
                    parsedText: version.parsedText,
                  }}
                />
              ))}
            </div>
          )}
        </section>
        {version.parsedText !== null && (
          <DocumentText
            text={version.parsedText}
            versionNo={version.versionNo}
            ranges={ranges}
            emphasisedKey={null}
            sticky={wide}
          />
        )}
      </div>
    </>
  );
}
