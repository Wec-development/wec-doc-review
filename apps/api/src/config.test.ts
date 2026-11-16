import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig: extractor selection', () => {
  it('uses the LLM extractor by default (provider and key come from Settings)', () => {
    expect(loadConfig({}).EXTRACTOR).toBe('llm');
    expect(loadConfig({ EXTRACTOR: '' }).EXTRACTOR).toBe('llm');
  });

  it('respects an explicit EXTRACTOR=fake', () => {
    expect(loadConfig({ EXTRACTOR: 'fake' }).EXTRACTOR).toBe('fake');
  });
});

describe('loadConfig: secrets', () => {
  it('has no LLM key, model or provider settings any more', () => {
    const config = loadConfig({ LLM_API_KEY: 'sk-ant-ignored', LLM_MODEL: 'x' });
    expect(config).not.toHaveProperty('LLM_API_KEY');
    expect(config).not.toHaveProperty('LLM_MODEL');
    expect(config).not.toHaveProperty('LLM_PROVIDER');
  });

  it('defaults SECRETS_DIR to ./secrets and treats an empty APP_ENCRYPTION_KEY as unset', () => {
    const config = loadConfig({ APP_ENCRYPTION_KEY: '  ' });
    expect(config.SECRETS_DIR).toBe('./secrets');
    expect(config.APP_ENCRYPTION_KEY).toBeUndefined();
  });

  it('keeps the operational LLM limits as environment settings', () => {
    expect(loadConfig({ LLM_TIMEOUT_MS: '5000' })).toMatchObject({
      LLM_TIMEOUT_MS: 5000,
      MAX_DOCUMENT_CHARS: 100_000,
    });
  });
});
