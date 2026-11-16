import styles from './States.module.css';

/** Placeholder cards while data loads or extraction runs (hidden from screen readers). */
export function Skeleton({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className={styles.skeleton}>
      {label && <span className="visually-hidden">{label}</span>}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.skeletonCard} aria-hidden="true">
          <div className={styles.barShort} />
          <div className={styles.barLong} />
          <div className={styles.barMid} />
        </div>
      ))}
    </div>
  );
}
