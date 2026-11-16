import type { LlmModelOption, LlmProvider, LlmSettings } from '@doc-review/shared';

export type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'passed'; models: LlmModelOption[] }
  | { status: 'failed'; message: string };

export interface SettingsFormState {
  provider: LlmProvider;
  /** The key being typed. Cleared after a save: the key is never shown again. */
  apiKey: string;
  /** True when a new key must be entered (none saved, the user chose "Replace key", or the
   * provider differs from the saved one). */
  enteringKey: boolean;
  test: TestState;
  model: string | null;
}

export type SettingsFormAction =
  | { type: 'provider'; provider: LlmProvider }
  | { type: 'key'; apiKey: string }
  | { type: 'replaceKey' }
  | { type: 'keepSavedKey' }
  | { type: 'testStarted' }
  | { type: 'testPassed'; models: LlmModelOption[] }
  | { type: 'testFailed'; message: string }
  | { type: 'model'; model: string }
  | { type: 'saved'; settings: LlmSettings };

/** The form as it opens: the saved provider and model, the key hidden behind its hint. */
export function initialSettingsForm(saved: LlmSettings | undefined): SettingsFormState {
  const configured = saved?.configured === true && saved.provider !== null;
  return {
    provider: saved?.provider ?? 'anthropic',
    apiKey: '',
    enteringKey: !configured,
    test: { status: 'idle' },
    model: saved?.model ?? null,
  };
}

/**
 * Pure state transitions. Any change to provider or key invalidates an earlier test, so Save
 * can never send a key or model that was not verified for the current choice.
 */
export function settingsFormReducer(
  saved: LlmSettings | undefined,
): (state: SettingsFormState, action: SettingsFormAction) => SettingsFormState {
  return (state, action) => {
    switch (action.type) {
      case 'provider': {
        if (action.provider === state.provider) return state;
        const backToSaved = saved?.configured === true && saved.provider === action.provider;
        return {
          provider: action.provider,
          apiKey: '',
          enteringKey: !backToSaved,
          test: { status: 'idle' },
          model: backToSaved ? saved.model : null,
        };
      }
      case 'key':
        return { ...state, apiKey: action.apiKey, test: { status: 'idle' }, model: null };
      case 'replaceKey':
        return { ...state, enteringKey: true, apiKey: '', test: { status: 'idle' } };
      case 'keepSavedKey':
        return initialSettingsForm(saved);
      case 'testStarted':
        return { ...state, test: { status: 'testing' } };
      case 'testPassed': {
        const recommended = action.models.find((option) => option.recommended) ?? action.models[0];
        const keepCurrent = action.models.some((option) => option.id === state.model);
        return {
          ...state,
          test: { status: 'passed', models: action.models },
          model: keepCurrent ? state.model : (recommended?.id ?? null),
        };
      }
      case 'testFailed':
        return { ...state, test: { status: 'failed', message: action.message }, model: null };
      case 'model':
        return { ...state, model: action.model };
      case 'saved':
        return initialSettingsForm(action.settings);
    }
  };
}

/** Testing the saved key is allowed only for its own provider; a new key must be typed. */
export function usesSavedKey(state: SettingsFormState): boolean {
  return !state.enteringKey;
}

export function canTest(state: SettingsFormState): boolean {
  return state.test.status !== 'testing' && (usesSavedKey(state) || state.apiKey.trim() !== '');
}

/**
 * Save is enabled once the current provider + key passed the test and a listed model is chosen,
 * or when the saved key is kept for the same provider (the server re-verifies on save anyway).
 */
export function canSave(state: SettingsFormState): boolean {
  if (state.model === null) return false;
  if (state.test.status === 'passed') {
    return state.test.models.some((option) => option.id === state.model);
  }
  return usesSavedKey(state) && state.test.status === 'idle';
}

/** Anything to undo? Cancel is offered only then. */
export function isDirty(state: SettingsFormState, saved: LlmSettings | undefined): boolean {
  const initial = initialSettingsForm(saved);
  return (
    state.provider !== initial.provider ||
    state.apiKey !== '' ||
    state.enteringKey !== initial.enteringKey ||
    state.model !== initial.model ||
    state.test.status !== 'idle'
  );
}
