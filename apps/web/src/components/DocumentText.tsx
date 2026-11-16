import { useMemo } from 'react';
import { type HighlightRange, highlightSegments } from '../lib/highlight.js';
import styles from './DocumentText.module.css';

interface DocumentTextProps {
  text: string;
  versionNo: number;
  ranges: HighlightRange[];
  /** The value whose quote was just jumped to; briefly emphasised. */
  emphasisedKey: string | null;
}

export const evidenceAnchorId = (valueId: string) => `evidence-${valueId}`;

/** The version's parsed text, with each value's source quote highlighted at its offsets. */
export function DocumentText({ text, versionNo, ranges, emphasisedKey }: DocumentTextProps) {
  const segments = useMemo(() => highlightSegments(text, ranges), [text, ranges]);
  return (
    <aside className={styles.panel} aria-labelledby="document-text-title">
      <div className={styles.head}>
        <h2 id="document-text-title" className={styles.title}>
          Parsed text · v{versionNo}
        </h2>
        <ul className={styles.legend} aria-label="Highlight legend">
          <li>
            <span className={styles.swatchPending} aria-hidden="true" />
            Needs review
          </li>
          <li>
            <span className={styles.swatchNeutral} aria-hidden="true" />
            Reviewed or carried over
          </li>
        </ul>
      </div>
      <div className={styles.text} tabIndex={0} aria-label={`Document text, version ${versionNo}`}>
        {segments.map((segment) =>
          segment.highlight ? (
            <mark
              key={segment.start}
              id={evidenceAnchorId(segment.highlight.key)}
              className={`${segment.highlight.tone === 'pending' ? styles.pending : styles.neutral} ${
                segment.highlight.key === emphasisedKey ? styles.emphasised : ''
              }`}
            >
              {segment.text}
            </mark>
          ) : (
            <span key={segment.start}>{segment.text}</span>
          ),
        )}
      </div>
    </aside>
  );
}
