import { LLM_PROVIDER_LABELS, LLM_PROVIDERS, type LlmProvider } from '@doc-review/shared';
import styles from './Settings.module.css';

interface ProviderSwitchProps {
  value: LlmProvider;
  onChange: (provider: LlmProvider) => void;
}

/** A radio group shown as a segmented control: Tab reaches it, arrow keys switch provider. */
export function ProviderSwitch({ value, onChange }: ProviderSwitchProps) {
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>Provider</legend>
      <div className={styles.segmented}>
        {LLM_PROVIDERS.map((provider) => (
          <label key={provider} className={styles.segment}>
            <input
              type="radio"
              name="llm-provider"
              value={provider}
              checked={value === provider}
              onChange={() => onChange(provider)}
            />
            <span>{LLM_PROVIDER_LABELS[provider]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
