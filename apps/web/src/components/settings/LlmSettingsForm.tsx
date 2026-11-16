import type { LlmSettings } from '@doc-review/shared';
import { useReducer } from 'react';
import { errorMessage } from '../../api/client.js';
import { useSaveLlmSettings, useTestLlmConnection } from '../../api/queries.js';
import {
  canSave,
  canTest,
  initialSettingsForm,
  isDirty,
  settingsFormReducer,
  usesSavedKey,
} from '../../lib/settings-form.js';
import buttons from '../../styles/buttons.module.css';
import { useAnnounce } from '../Announcer.js';
import { ApiKeyField } from './ApiKeyField.js';
import { CurrentSettings } from './CurrentSettings.js';
import { ModelSelect } from './ModelSelect.js';
import { ProviderSwitch } from './ProviderSwitch.js';
import { SettingsCardHeader } from './SettingsCardHeader.js';
import styles from './Settings.module.css';
import { TestConnection } from './TestConnection.js';

/** Provider → key → Test connection → model → Save. The server re-verifies everything on save. */
interface LlmSettingsFormProps {
  saved: LlmSettings;
  onSaved: (settings: LlmSettings) => void;
}

export function LlmSettingsForm({ saved, onSaved }: LlmSettingsFormProps) {
  const [state, dispatch] = useReducer(settingsFormReducer(saved), saved, initialSettingsForm);
  const testConnection = useTestLlmConnection();
  const save = useSaveLlmSettings();
  const announce = useAnnounce();
  const keepingSavedKey = usesSavedKey(state);
  const apiKey = keepingSavedKey ? undefined : state.apiKey.trim();

  const onTest = () => {
    dispatch({ type: 'testStarted' });
    testConnection.mutate(
      { provider: state.provider, ...(apiKey ? { apiKey } : {}) },
      {
        onSuccess: (result) => dispatch({ type: 'testPassed', models: result.models }),
        onError: (error) => dispatch({ type: 'testFailed', message: errorMessage(error) }),
      },
    );
  };

  const onSave = () => {
    if (state.model === null) return;
    save.mutate(
      { provider: state.provider, model: state.model, ...(apiKey ? { apiKey } : {}) },
      {
        onSuccess: (settings) => {
          dispatch({ type: 'saved', settings });
          announce('LLM settings saved');
          onSaved(settings);
        },
      },
    );
  };

  return (
    <form
      className={styles.card}
      aria-labelledby="llm-settings-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave(state) && !save.isPending) onSave();
      }}
    >
      <SettingsCardHeader configured={saved.configured} />

      <div className={styles.cardBody}>
        <CurrentSettings saved={saved} />
        <ProviderSwitch
          value={state.provider}
          onChange={(provider) => dispatch({ type: 'provider', provider })}
        />
        <ApiKeyField
          value={state.apiKey}
          onChange={(value) => dispatch({ type: 'key', apiKey: value })}
          savedHint={saved.keyHint}
          entering={state.enteringKey}
          canKeepSaved={saved.configured && saved.provider === state.provider}
          onReplace={() => dispatch({ type: 'replaceKey' })}
          onKeepSaved={() => dispatch({ type: 'keepSavedKey' })}
        />
        <TestConnection test={state.test} disabled={!canTest(state)} onTest={onTest} />
        <ModelSelect
          options={state.test.status === 'passed' ? state.test.models : null}
          value={state.model}
          onChange={(model) => dispatch({ type: 'model', model })}
        />
      </div>

      <footer className={styles.actions}>
        <p
          className={`${styles.result} ${save.isError ? styles.failure : styles.success}`}
          role="status"
        >
          {save.isError
            ? `Could not save: ${errorMessage(save.error)}`
            : save.isSuccess
              ? 'LLM settings saved'
              : null}
        </p>
        <button
          type="button"
          className={buttons.secondary}
          onClick={() => dispatch({ type: 'keepSavedKey' })}
          disabled={!isDirty(state, saved) || save.isPending}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={buttons.primary}
          disabled={!canSave(state) || save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </footer>
    </form>
  );
}
