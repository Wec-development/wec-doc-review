import { describe, expect, it } from 'vitest';
import { inferProvider, loadConfig } from './config.js';

describe('loadConfig: extractor selection', () => {
  it('uses the fake extractor when there is no API key (tests and CI)', () => {
    expect(loadConfig({}).EXTRACTOR).toBe('fake');
    expect(loadConfig({ LLM_API_KEY: '', EXTRACTOR: '' }).EXTRACTOR).toBe('fake');
  });

  it('uses the LLM extractor by default when an API key is set', () => {
    expect(loadConfig({ LLM_API_KEY: 'sk-test' }).EXTRACTOR).toBe('llm');
  });

  it('respects an explicit EXTRACTOR', () => {
    expect(loadConfig({ LLM_API_KEY: 'sk-test', EXTRACTOR: 'fake' }).EXTRACTOR).toBe('fake');
  });

  it('treats an empty LLM_MODEL as unset', () => {
    expect(loadConfig({ LLM_MODEL: '  ' }).LLM_MODEL).toBeUndefined();
  });
});

describe('loadConfig: LLM provider', () => {
  it('infers the provider from the model name', () => {
    expect(inferProvider('claude-opus-5-5')).toBe('anthropic');
    expect(inferProvider('gpt-4o-mini')).toBe('openai');
    expect(inferProvider('chatgpt-4o-latest')).toBe('openai');
    expect(inferProvider('o4-mini')).toBe('openai');
    expect(loadConfig({ LLM_MODEL: 'gpt-4o-mini' }).LLM_PROVIDER).toBe('openai');
  });

  it('leaves the provider unset for an unknown model or no model', () => {
    expect(loadConfig({ LLM_MODEL: 'mistral-large' }).LLM_PROVIDER).toBeUndefined();
    expect(loadConfig({}).LLM_PROVIDER).toBeUndefined();
    expect(inferProvider('omni-model')).toBeUndefined();
  });

  it('lets an explicit LLM_PROVIDER win over the inferred one', () => {
    expect(loadConfig({ LLM_MODEL: 'my-gpt-proxy', LLM_PROVIDER: 'openai' }).LLM_PROVIDER).toBe(
      'openai',
    );
    expect(loadConfig({ LLM_MODEL: 'gpt-4o-mini', LLM_PROVIDER: '' }).LLM_PROVIDER).toBe('openai');
  });

  it('rejects an unknown LLM_PROVIDER', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'gemini' })).toThrow();
  });
});
