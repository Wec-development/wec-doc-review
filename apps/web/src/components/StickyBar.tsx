import { type ReactNode, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { usePublishedHeight } from '../hooks/usePublishedHeight.js';
import { useStuck } from '../hooks/useStuck.js';
import styles from './StickyReviewBar.module.css';

/**
 * A summary bar stuck below the app header while the page scrolls. A sentinel detects when it
 * is stuck (shows a shadow); its height is published as --review-bar-height so the side panel
 * and scroll padding sit just below it.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const stuck = useStuck(sentinel);
  const animate = !usePrefersReducedMotion();
  usePublishedHeight(bar, '--review-bar-height');

  const className = [styles.bar, stuck && styles.stuck, animate && styles.animated]
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <div ref={sentinel} className={styles.sentinel} aria-hidden="true" />
      <div
        ref={bar}
        className={className}
        data-sticky="review-bar"
        data-stuck={stuck ? 'true' : 'false'}
      >
        {children}
      </div>
    </>
  );
}
