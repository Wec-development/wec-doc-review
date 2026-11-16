import styles from './Snippets.module.css';

/** Settings in miniature: provider chosen, key masked, connection tested, cheap model picked. */
export function SettingsSnippet({ play }: { play: boolean }) {
  return (
    <div className={`${styles.frame} ${play ? styles.play : ''}`}>
      <div className={styles.chips}>
        <span className={`${styles.fakeButton} ${styles.fakePrimary}`}>Claude (Anthropic)</span>
        <span className={styles.fakeButton}>OpenAI</span>
      </div>
      <span className={styles.chip}>sk-ant-••••••••a1b2</span>
      <span className={`${styles.corrected} ${styles.appear}`}>
        <span className={styles.approvedText}>Connected — 3 models available</span>
      </span>
      <div className={`${styles.row} ${styles.appearLate}`}>
        <span className={styles.field}>model</span>
        <span className={styles.value}>claude-haiku-5-5</span>
        <span className={styles.approvedText}>Recommended — low cost</span>
      </div>
    </div>
  );
}
