import { Link } from 'react-router';
import { usePageTitle } from '../hooks/usePageTitle.js';
import styles from './Page.module.css';

/** Unknown routes and documents or versions that do not exist. */
export function NotFoundPage({ what = 'page' }: { what?: string }) {
  usePageTitle('Not found');
  return (
    <main className={styles.main}>
      <h1 className={styles.h1}>Not found</h1>
      <p className={styles.subtitle}>
        This {what} does not exist. <Link to="/">Go to all documents</Link>
      </p>
    </main>
  );
}
