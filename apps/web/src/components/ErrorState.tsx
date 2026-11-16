import buttons from '../styles/buttons.module.css';
import styles from './States.module.css';

/** A failed request: a readable message and a way to try again. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className={styles.error} role="alert">
      <h2 className={styles.errorTitle}>Could not load this page</h2>
      <p>{message}</p>
      <button type="button" className={buttons.secondary} onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}
