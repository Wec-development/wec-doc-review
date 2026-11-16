import { useState } from 'react';
import { errorMessage } from '../api/client.js';
import { useLlmSettings } from '../api/queries.js';
import { ErrorState } from '../components/ErrorState.js';
import { LlmSettingsForm } from '../components/settings/LlmSettingsForm.js';
import { SettingsAside } from '../components/settings/SettingsAside.js';
import styles from '../components/settings/Settings.module.css';
import { Skeleton } from '../components/Skeleton.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import pageStyles from './Page.module.css';

/** `/settings`: which LLM extracts values, configured here instead of in environment files. */
export function SettingsPage() {
  usePageTitle('Settings');
  const settings = useLlmSettings();
  const [justSaved, setJustSaved] = useState<{ keyHint: string | null } | null>(null);

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.titleRow}>
        <div>
          <h1 className={pageStyles.h1}>Settings</h1>
          <p className={pageStyles.subtitle}>
            Choose the AI model that extracts values from your documents.
          </p>
        </div>
      </div>
      {settings.isPending && <Skeleton rows={2} label="Loading settings" />}
      {settings.isError && (
        <ErrorState
          message={errorMessage(settings.error)}
          onRetry={() => void settings.refetch()}
        />
      )}
      {settings.isSuccess && (
        <div className={styles.layout}>
          <LlmSettingsForm
            saved={settings.data}
            onSaved={(saved) => setJustSaved({ keyHint: saved.keyHint })}
          />
          <SettingsAside justSaved={justSaved} provider={settings.data.provider ?? 'anthropic'} />
        </div>
      )}
    </main>
  );
}
