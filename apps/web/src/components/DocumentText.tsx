import { useEffect, useMemo, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { type HighlightRange, highlightSegments } from '../lib/highlight.js';
import styles from './DocumentText.module.css';

/** "Show this value's quote": `seq` changes on every click, so the same value can be re-shown. */
export interface JumpRequest {
  key: string;
  seq: number;
}

interface DocumentTextProps {
  text: string;
  versionNo: number;
  ranges: HighlightRange[];
  /** The value whose quote was just jumped to; briefly emphasised. */
  emphasisedKey: string | null;
  jumpTo?: JumpRequest | null;
  /** Wide layout: the panel stays in view beside the values and scrolls on its own. */
  sticky?: boolean;
}

export const evidenceAnchorId = (valueId: string) => `evidence-${valueId}`;

/**
 * Brings a quote into view. In the sticky panel only the panel's own text scrolls (never the
 * page); when stacked on narrow screens the page scrolls to it as well.
 */
function revealQuote(scroller: HTMLElement, mark: HTMLElement, sticky: boolean, smooth: boolean) {
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
  if (!sticky) {
    mark.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
    return;
  }
  scroller.scrollTo({
    top: Math.max(0, mark.offsetTop - scroller.clientHeight / 3),
    left: Math.max(0, mark.offsetLeft - 24),
    behavior,
  });
}

/** The version's parsed text, with each value's source quote highlighted at its offsets. */
export function DocumentText({
  text,
  versionNo,
  ranges,
  emphasisedKey,
  jumpTo = null,
  sticky = false,
}: DocumentTextProps) {
  const segments = useMemo(() => highlightSegments(text, ranges), [text, ranges]);
  const scroller = useRef<HTMLDivElement>(null);
  const smooth = !usePrefersReducedMotion();

  // The latest layout and motion settings, read when a jump happens; changing them alone (e.g.
  // resizing past the breakpoint) must not scroll anything.
  const settings = useRef({ sticky, smooth });
  useEffect(() => {
    settings.current = { sticky, smooth };
  }, [sticky, smooth]);

  useEffect(() => {
    const container = scroller.current;
    if (!jumpTo || !container) return;
    const mark = container.querySelector<HTMLElement>(`[id="${evidenceAnchorId(jumpTo.key)}"]`);
    if (mark) revealQuote(container, mark, settings.current.sticky, settings.current.smooth);
  }, [jumpTo]);

  return (
    <aside
      className={`${styles.panel} ${sticky ? styles.sticky : ''}`}
      aria-labelledby="document-text-title"
      data-sticky={sticky ? 'document-panel' : undefined}
    >
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
      <div
        ref={scroller}
        className={styles.text}
        // A named, focusable region: keyboard users can reach and scroll the document text.
        role="region"
        tabIndex={0}
        aria-label={`Document text, version ${versionNo}`}
      >
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
