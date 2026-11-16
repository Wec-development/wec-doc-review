import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

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
