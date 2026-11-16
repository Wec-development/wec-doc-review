import type { LlmModelOption, LlmSettings } from '@doc-review/shared';
import { describe, expect, it } from 'vitest';
import {
  canSave,
  canTest,
  isDirty,
  initialSettingsForm,
  type SettingsFormAction,
  settingsFormReducer,
  type SettingsFormState,
} from './settings-form.js';

const MODELS: LlmModelOption[] = [
  { id: 'claude-haiku-5-5', label: 'Recommended — low cost', recommended: true },
  { id: 'claude-sonnet-5-5', label: 'Higher accuracy — higher cost', recommended: false },
];

const SAVED: LlmSettings = {
  configured: true,
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  keyHint: 'a1b2',
  lastVerifiedAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
};

function run(saved: LlmSettings | undefined, ...actions: SettingsFormAction[]): SettingsFormState {
  const reduce = settingsFormReducer(saved);
  return actions.reduce(reduce, initialSettingsForm(saved));
}

describe('settings form', () => {
  it('starts on Claude with a key to enter and nothing to save when unconfigured', () => {
    const state = run(undefined);
    expect(state).toMatchObject({ provider: 'anthropic', enteringKey: true, model: null });
    expect(canTest(state)).toBe(false);
    expect(canSave(state)).toBe(false);
  });

  it('enables Save only after the test passes, pre-selecting the recommended model', () => {
    const typed = run(undefined, { type: 'key', apiKey: 'sk-ant-new-key-123456789' });
    expect(canTest(typed)).toBe(true);
    expect(canSave(typed)).toBe(false);

    const passed = run(
      undefined,
      { type: 'key', apiKey: 'sk-ant-new-key-123456789' },
      { type: 'testStarted' },
      { type: 'testPassed', models: MODELS },
    );
    expect(passed.model).toBe('claude-haiku-5-5');
    expect(canSave(passed)).toBe(true);
  });

  it('resets the test when the key or the provider changes', () => {
    const passed: SettingsFormAction[] = [
      { type: 'key', apiKey: 'sk-ant-new-key-123456789' },
      { type: 'testPassed', models: MODELS },
    ];

    const editedKey = run(undefined, ...passed, {
      type: 'key',
      apiKey: 'sk-ant-other-key-1234567',
    });
    expect(editedKey.test).toEqual({ status: 'idle' });
    expect(canSave(editedKey)).toBe(false);

    const switched = run(undefined, ...passed, { type: 'provider', provider: 'openai' });
    expect(switched).toMatchObject({ provider: 'openai', apiKey: '', test: { status: 'idle' } });
    expect(canSave(switched)).toBe(false);
  });

  it('keeps Save disabled after a failed test or while testing', () => {
    const failed = run(
      undefined,
      { type: 'key', apiKey: 'sk-ant-bad-key-1234567890' },
      { type: 'testFailed', message: 'Invalid API key' },
    );
    expect(failed.test).toEqual({ status: 'failed', message: 'Invalid API key' });
    expect(canSave(failed)).toBe(false);
    expect(
      canTest(run(undefined, { type: 'key', apiKey: 'x'.repeat(30) }, { type: 'testStarted' })),
    ).toBe(false);
  });

  it('keeps the saved key for the same provider, so a model change can be saved', () => {
    const opened = run(SAVED);
    expect(opened).toMatchObject({ enteringKey: false, model: 'claude-sonnet-5-5', apiKey: '' });
    expect(canTest(opened)).toBe(true);
    expect(canSave(opened)).toBe(true);

    const retested = run(SAVED, { type: 'testPassed', models: MODELS });
    expect(retested.model).toBe('claude-sonnet-5-5'); // the saved choice is kept when available
  });

  it('requires a new key when switching away from the saved provider, not when coming back', () => {
    const away = run(SAVED, { type: 'provider', provider: 'openai' });
    expect(away).toMatchObject({ enteringKey: true, model: null });
    expect(canTest(away)).toBe(false);

    const back = run(
      SAVED,
      { type: 'provider', provider: 'openai' },
      { type: 'provider', provider: 'anthropic' },
    );
    expect(back).toMatchObject({ enteringKey: false, model: 'claude-sonnet-5-5' });
  });

  it('"Replace key" asks for a new key; "Keep saved key" goes back', () => {
    const replacing = run(SAVED, { type: 'replaceKey' });
    expect(replacing.enteringKey).toBe(true);
    expect(canSave(replacing)).toBe(false);
    expect(run(SAVED, { type: 'replaceKey' }, { type: 'keepSavedKey' }).enteringKey).toBe(false);
  });

  it('forgets the typed key after saving', () => {
    const saved = run(
      undefined,
      { type: 'key', apiKey: 'sk-ant-new-key-123456789' },
      { type: 'testPassed', models: MODELS },
      { type: 'saved', settings: { ...SAVED, model: 'claude-haiku-5-5' } },
    );
    expect(saved).toMatchObject({ apiKey: '', enteringKey: false, model: 'claude-haiku-5-5' });
  });

  it('is dirty after any change, and clean again after Cancel (keep saved key)', () => {
    expect(isDirty(run(SAVED), SAVED)).toBe(false);
    expect(isDirty(run(SAVED, { type: 'provider', provider: 'openai' }), SAVED)).toBe(true);
    expect(isDirty(run(SAVED, { type: 'replaceKey' }), SAVED)).toBe(true);
    expect(isDirty(run(SAVED, { type: 'replaceKey' }, { type: 'keepSavedKey' }), SAVED)).toBe(
      false,
    );
    expect(isDirty(run(undefined, { type: 'key', apiKey: 'sk-ant-x' }), undefined)).toBe(true);
  });
});
