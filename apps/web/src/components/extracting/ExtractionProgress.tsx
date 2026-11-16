import type { VersionStatus } from '@doc-review/shared';
import styles from './Extracting.module.css';

type StepState = 'done' | 'current' | 'upcoming';

interface Step {
  label: string;
  note: string;
}

const STEPS: readonly Step[] = [
  { label: 'Uploaded', note: 'The PDF is stored; the upload returned right away.' },
  { label: 'Waiting for a worker', note: 'Queued in the database until a worker picks it up.' },
  {
    label: 'Extracting values',
    note: 'The AI model reads the text; every value must quote the document word for word.',
  },
  { label: 'Ready to review', note: 'Values appear here, each beside its source quote.' },
];

/** Which step each status has reached: queued = step 2, extracting = step 3. */
function stateOf(index: number, status: VersionStatus): StepState {
  const current = status === 'extracting' ? 2 : 1;
  if (index < current) return 'done';
  return index === current ? 'current' : 'upcoming';
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

interface ExtractionProgressProps {
  status: VersionStatus;
  versionNo: number;
  /** Set when an earlier attempt failed and the job was queued again. */
  retryNote: string | null;
}

/** The left column while extracting: where this version is, step by step. */
export function ExtractionProgress({ status, versionNo, retryNote }: ExtractionProgressProps) {
  return (
    <section className={styles.progress} aria-labelledby="extraction-progress-title">
      <h2 id="extraction-progress-title" className={styles.progressTitle}>
        Extraction progress · v{versionNo}
      </h2>
      <p className={styles.progressIntro}>Usually a few seconds per document.</p>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => {
          const state = stateOf(index, status);
          return (
            <li
              key={step.label}
              className={`${styles.step} ${styles[state] ?? ''}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className={styles.marker} aria-hidden="true">
                {state === 'done' ? <Check /> : index + 1}
              </span>
              <div>
                <p className={styles.stepLabel}>
                  {step.label}
                  <span className="visually-hidden">
                    {state === 'done' ? ' (done)' : state === 'current' ? ' (in progress)' : ''}
                  </span>
                </p>
                <p className={styles.stepNote}>{step.note}</p>
                {state === 'current' && retryNote && (
                  <p className={styles.retryNote}>{retryNote}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className={styles.reassure}>
        You can leave this page: extraction keeps running in the background and survives restarts.
      </p>
    </section>
  );
}
