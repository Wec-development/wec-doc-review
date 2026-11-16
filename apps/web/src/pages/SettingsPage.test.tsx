import type { LlmModelOption, LlmSettings } from '@doc-review/shared';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client.js';
import { makeSummary } from '../test/factories.js';
import { mockedApi } from '../test/mock-api.js';
import { renderApp } from '../test/render.js';

vi.mock('../api/client.js', async (importOriginal) =>
  (await import('../test/api-mock-factory.js')).apiModuleMock(importOriginal),
);
const api = mockedApi();

const KEY = 'sk-ant-api03-ui-test-key-000000-a1b2';
const UNCONFIGURED: LlmSettings = {
  configured: false,
  provider: null,
  model: null,
  keyHint: null,
  lastVerifiedAt: null,
  updatedAt: null,
};
const SAVED: LlmSettings = {
  configured: true,
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  keyHint: 'a1b2',
  lastVerifiedAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
};
const MODELS: LlmModelOption[] = [
  { id: 'claude-haiku-5-5', label: 'Recommended — low cost', recommended: true },
  { id: 'claude-sonnet-5-5', label: 'Higher accuracy — higher cost', recommended: false },
];

beforeEach(() => {
  vi.resetAllMocks();
  api.getLlmSettings.mockResolvedValue(UNCONFIGURED);
  api.listDocuments.mockResolvedValue({ documents: [] });
});

const saveButton = () => screen.getByRole('button', { name: 'Save settings' });
const keyInput = () => screen.getByLabelText('API key');
const modelSelect = () => screen.getByRole('combobox', { name: 'Model' });

async function openSettings() {
  const rendered = renderApp('/settings');
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  // The form appears once the saved settings have loaded.
  await screen.findByRole('heading', { level: 2, name: 'LLM for extraction' });
  return rendered;
}

describe('Settings: first configuration', () => {
  it('enables Save only after a passing test, with the recommended model pre-selected', async () => {
    api.testLlmConnection.mockResolvedValue({ valid: true, models: MODELS });
    api.saveLlmSettings.mockResolvedValue(SAVED);
    const { user, container } = await openSettings();

    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
    await user.type(keyInput(), KEY);
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Connected — 2 models available')).toBeInTheDocument();
    expect(api.testLlmConnection).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: KEY });
    expect(modelSelect()).toHaveValue('claude-haiku-5-5');
    expect(
      within(modelSelect()).getByRole('option', {
        name: /claude-haiku-5-5 — Recommended — low cost/,
      }),
    ).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());

    expect(api.saveLlmSettings).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      apiKey: KEY,
    });
    expect(await screen.findByText(/Key saved/)).toHaveTextContent('Key saved (…a1b2)');
    expect(screen.getAllByText('LLM settings saved').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(KEY);
  });

  it('shows a readable error for an invalid key and keeps Save disabled', async () => {
    api.testLlmConnection.mockRejectedValue(
      new ApiError(401, 'INVALID_API_KEY', 'Invalid API key'),
    );
    const { user } = await openSettings();

    await user.type(keyInput(), KEY);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText('Invalid API key')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('shows "Provider unreachable — try again" when the provider cannot be reached', async () => {
    api.testLlmConnection.mockRejectedValue(
      new ApiError(502, 'PROVIDER_UNAVAILABLE', 'Provider unreachable — try again'),
    );
    const { user } = await openSettings();
    await user.type(keyInput(), KEY);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Provider unreachable — try again')).toBeInTheDocument();
  });

  it('resets the test result when the key or the provider changes', async () => {
    api.testLlmConnection.mockResolvedValue({ valid: true, models: MODELS });
    const { user } = await openSettings();
    await user.type(keyInput(), KEY);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await screen.findByText('Connected — 2 models available');

    await user.type(keyInput(), 'x');
    expect(screen.queryByText('Connected — 2 models available')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await screen.findByText('Connected — 2 models available');
    await user.click(screen.getByRole('radio', { name: 'OpenAI' }));
    expect(screen.queryByText('Connected — 2 models available')).not.toBeInTheDocument();
    expect(keyInput()).toHaveValue('');
    expect(saveButton()).toBeDisabled();
  });

  it('shows and hides the key on request', async () => {
    const { user } = await openSettings();
    await user.type(keyInput(), KEY);
    expect(keyInput()).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show API key' }));
    expect(keyInput()).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide API key' }));
    expect(keyInput()).toHaveAttribute('type', 'password');
  });

  it('works with the keyboard only: provider by arrow keys, Enter to test and save', async () => {
    api.testLlmConnection.mockResolvedValue({
      valid: true,
      models: [{ id: 'gpt-6-luna', label: 'Recommended — low cost', recommended: true }],
    });
    api.saveLlmSettings.mockResolvedValue({ ...SAVED, provider: 'openai', model: 'gpt-6-luna' });
    const { user } = await openSettings();

    const claude = screen.getByRole('radio', { name: 'Claude (Anthropic)' });
    while (document.activeElement !== claude) await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked();

    await user.tab();
    expect(keyInput()).toHaveFocus();
    await user.keyboard('sk-proj-ui-test-key-0000000-a1b2');
    const testButton = screen.getByRole('button', { name: 'Test connection' });
    while (document.activeElement !== testButton) await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByText('Connected — 1 model available');

    while (document.activeElement !== saveButton()) await user.tab();
    await user.keyboard('{Enter}');

    expect(api.saveLlmSettings).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-6-luna',
      apiKey: 'sk-proj-ui-test-key-0000000-a1b2',
    });
  });
});

describe('Settings: a key is already saved', () => {
  it('shows only the masked hint, and can save a new model keeping the stored key', async () => {
    api.getLlmSettings.mockResolvedValue(SAVED);
    api.testLlmConnection.mockResolvedValue({ valid: true, models: MODELS });
    api.saveLlmSettings.mockResolvedValue({ ...SAVED, model: 'claude-sonnet-5-5' });
    const { user } = await openSettings();

    expect(screen.getByText(/Key saved/)).toHaveTextContent('Key saved (…a1b2)');
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await screen.findByText('Connected — 2 models available');
    expect(api.testLlmConnection).toHaveBeenCalledWith({ provider: 'anthropic' });
    await user.selectOptions(modelSelect(), 'claude-sonnet-5-5');
    await user.click(saveButton());

    expect(api.saveLlmSettings).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
  });

  it('"Replace key" asks for a new key and disables Save until it is tested', async () => {
    api.getLlmSettings.mockResolvedValue(SAVED);
    const { user } = await openSettings();

    await user.click(screen.getByRole('button', { name: 'Replace key' }));

    expect(keyInput()).toHaveValue('');
    expect(saveButton()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Keep saved key' }));
    expect(saveButton()).toBeEnabled();
  });
});

describe('Settings: layout and status', () => {
  it('shows the status badge and a summary of the current settings with a masked key', async () => {
    api.getLlmSettings.mockResolvedValue(SAVED);
    await openSettings();

    expect(screen.getByText('Configured')).toBeInTheDocument();
    const summary = screen.getByLabelText('Current settings');
    expect(summary).not.toBeNull();
    const current = within(summary as HTMLElement);
    expect(current.getByText('Claude (Anthropic)')).toBeInTheDocument();
    expect(current.getByText('claude-haiku-5-5')).toBeInTheDocument();
    expect(current.getByText(/a1b2/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What happens on Save' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No sign-in in this app' })).toBeInTheDocument();
  });

  it('shows "Not configured" and no summary before the first save', async () => {
    await openSettings();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.queryByRole('definition')).not.toBeInTheDocument();
  });

  it('Cancel undoes unsaved changes and is disabled when there are none', async () => {
    api.getLlmSettings.mockResolvedValue(SAVED);
    const { user } = await openSettings();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'OpenAI' }));
    expect(cancel).toBeEnabled();
    await user.click(cancel);

    expect(screen.getByRole('radio', { name: 'Claude (Anthropic)' })).toBeChecked();
    expect(screen.getByText(/Key saved/)).toBeInTheDocument();
    expect(cancel).toBeDisabled();
  });

  it('confirms a save beside the form with the last 4 characters only', async () => {
    api.testLlmConnection.mockResolvedValue({ valid: true, models: MODELS });
    api.saveLlmSettings.mockResolvedValue(SAVED);
    const { user, container } = await openSettings();
    await user.type(keyInput(), KEY);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await screen.findByText('Connected — 2 models available');
    await user.click(saveButton());

    const aside = screen.getByRole('complementary', { name: 'About these settings' });
    expect(await within(aside).findByText(/Saved · key ending in/)).toHaveTextContent(
      'Saved · key ending in a1b2. Used from the next document.',
    );
    expect(container.innerHTML).not.toContain(KEY);
  });
});

describe('extraction paused banner and navigation', () => {
  it('shows the banner on the documents list while no LLM is configured', async () => {
    api.listDocuments.mockResolvedValue({ documents: [makeSummary({ status: 'queued' })] });
    const { user } = renderApp('/');

    expect(
      await screen.findByText('Extraction is paused — configure an LLM in Settings.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('shows no banner once an LLM is configured', async () => {
    api.getLlmSettings.mockResolvedValue(SAVED);
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
    await vi.waitFor(() => expect(api.getLlmSettings).toHaveBeenCalled());
    expect(screen.queryByText(/Extraction is paused/)).not.toBeInTheDocument();
  });

  it('opens Settings from the header', async () => {
    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(document.title).toBe('Settings · Review Desk');
  });
});
