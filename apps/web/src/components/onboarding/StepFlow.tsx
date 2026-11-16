import styles from './Onboarding.module.css';
import { ExtractionSnippet } from './snippets/ExtractionSnippet.js';
import { ReviewSnippet } from './snippets/ReviewSnippet.js';
import { SettingsSnippet } from './snippets/SettingsSnippet.js';
import { UploadSnippet } from './snippets/UploadSnippet.js';
import { VersionSnippet } from './snippets/VersionSnippet.js';
import { StepCard } from './StepCard.js';

/** The five steps, in the order the system runs them. Each description is the text equivalent
 * of its (decorative) snippet. */
const STEPS = [
  {
    title: 'Configure an LLM',
    description:
      'Open Settings, choose Claude (Anthropic) or OpenAI, paste an API key and test the connection. A low-cost model suited to one-page extraction is pre-selected. Until an LLM is saved, uploads wait in the queue.',
    snippet: (play: boolean) => <SettingsSnippet play={play} />,
  },
  {
    title: 'Upload a PDF',
    description:
      'Choose the document type (invoice, lease or market report) and upload the PDF. The upload returns instantly; extraction runs in the background while the status shows Queued, then Extracting.',
    snippet: (play: boolean) => <UploadSnippet play={play} />,
  },
  {
    title: 'Extraction',
    description:
      'An AI model reads the document and pulls out the expected fields. Every value must come with the exact quote it came from. If the quote isn’t found word for word in the document, the field becomes a gap with a reason instead of a guess.',
    snippet: (play: boolean) => <ExtractionSnippet play={play} />,
  },
  {
    title: 'Review',
    description:
      'See each value beside its source quote, then approve it or correct it. A correction is stored beside the original value, never over it. Gaps are always shown with their reason.',
    snippet: (play: boolean) => <ReviewSnippet play={play} />,
  },
  {
    title: 'New versions',
    description:
      'Upload a revised PDF. Values whose evidence didn’t change keep their review and are marked carried over. Changed values come back for review, with the previous value shown beside them. Older versions stay available, read-only.',
    snippet: (play: boolean) => <VersionSnippet play={play} />,
  },
] as const;

export function StepFlow({ animate }: { animate: boolean }) {
  return (
    <ol className={styles.steps} aria-label="How it works, step by step">
      {STEPS.map((step, index) => (
        <StepCard
          key={step.title}
          number={index + 1}
          title={step.title}
          description={step.description}
          snippet={step.snippet}
          animate={animate}
        />
      ))}
    </ol>
  );
}
