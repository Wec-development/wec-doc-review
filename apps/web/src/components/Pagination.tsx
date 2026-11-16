import { Link } from 'react-router';
import { pageNumbers } from '../lib/pagination.js';
import styles from './Pagination.module.css';

interface PaginationProps {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  /** URL of a page (the page lives in the query string, so Back and links work). */
  hrefFor: (page: number) => string;
}

/** "Showing 26–50 of 60", then Previous · 1 2 3 · Next. Hidden when everything fits on one page. */
export function Pagination({ page, pageCount, from, to, total, hrefFor }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.bar} aria-label="Documents pages">
      <p className={styles.range}>
        Showing {from}–{to} of {total}
      </p>
      <ul className={styles.pages}>
        <li>
          {page > 1 ? (
            <Link className={styles.step} to={hrefFor(page - 1)}>
              <span aria-hidden="true">←</span> Previous
            </Link>
          ) : (
            <span className={`${styles.step} ${styles.disabled}`} aria-disabled="true">
              <span aria-hidden="true">←</span> Previous
            </span>
          )}
        </li>
        {pageNumbers(page, pageCount).map((n, index) =>
          n === 'gap' ? (
            <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                className={`${styles.number} ${n === page ? styles.current : ''}`}
                to={hrefFor(n)}
                aria-current={n === page ? 'page' : undefined}
                aria-label={`Page ${n}`}
              >
                {n}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link className={styles.step} to={hrefFor(page + 1)}>
              Next <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <span className={`${styles.step} ${styles.disabled}`} aria-disabled="true">
              Next <span aria-hidden="true">→</span>
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
