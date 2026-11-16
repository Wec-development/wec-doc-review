import buttons from '../../styles/buttons.module.css';
import type { TestState } from '../../lib/settings-form.js';
import styles from './Settings.module.css';

interface TestConnectionProps {
  test: TestState;
  disabled: boolean;
  onTest: () => void;
}

function describe(test: TestState): { text: string; className: string } | null {
  switch (test.status) {
    case 'idle':
      return null;
    case 'testing':
      return { text: 'Testing connection…', className: styles.pending ?? '' };
    case 'passed':
      return test.models.length === 0
        ? {
            text: 'Connected, but this key has no model suitable for extraction',
            className: styles.failure ?? '',
          }
        : {
            text: `Connected — ${test.models.length} ${test.models.length === 1 ? 'model' : 'models'} available`,
            className: styles.success ?? '',
          };
    case 'failed':
      return { text: test.message, className: styles.failure ?? '' };
  }
}

function PlugIcon() {
  return (
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
      <path d="m19 5-3 3" />
      <path d="m2 22 3-3" />
      <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4z" />
      <path d="M7.5 13.5 10 11" />
      <path d="M10.5 16.5 13 14" />
      <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0z" />
    </svg>
  );
}

/** Checks the key with the provider (a free list-models call); the result is announced. */
export function TestConnection({ test, disabled, onTest }: TestConnectionProps) {
  const result = describe(test);
  return (
    <section className={styles.testPanel} aria-labelledby="test-connection-title">
      <span className={styles.panelIcon} aria-hidden="true">
        <PlugIcon />
      </span>
      <div className={styles.testText}>
        <h3 id="test-connection-title" className={styles.panelTitle}>
          Test your connection
        </h3>
        <p className={styles.hint}>
          Checks the key with the provider and lists the models it can use. Testing does not change
          your settings.
        </p>
        <p
          className={`${styles.result} ${result?.className ?? ''}`}
          role="status"
          aria-live="polite"
        >
          {result?.text}
        </p>
      </div>
      <button
        type="button"
        className={buttons.secondary}
        onClick={onTest}
        disabled={disabled}
        aria-busy={test.status === 'testing'}
      >
        {test.status === 'testing' ? 'Testing…' : 'Test connection'}
      </button>
    </section>
  );
}
