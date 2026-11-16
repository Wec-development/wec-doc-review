import type { Config } from '../config.js';
import { resolveFixturesDir } from '../fixtures-dir.js';
import type { LlmSettingsResolver } from '../llm/settings-resolver.js';
import { LocalDiskStorage } from '../storage/file-storage.js';
import type { Extractor } from './extractor.js';
import { FakeExtractor } from './fake-extractor.js';
import { LlmExtractor } from './llm-extractor.js';
import { createFileResolver } from './resolve-file.js';

export interface ExtractorSetup {
  extractor: Extractor;
  /** False while no LLM is configured: the worker then leaves jobs queued. */
  canClaim: () => Promise<boolean>;
}

/** Selects the extractor from config. The LLM one reads provider, model and key from Settings. */
export function createExtractor(config: Config, settings: LlmSettingsResolver): ExtractorSetup {
  switch (config.EXTRACTOR) {
    case 'fake':
      return {
        extractor: new FakeExtractor({
          behavior: config.FAKE_EXTRACTOR_BEHAVIOR,
          delayMs: config.FAKE_EXTRACTOR_DELAY_MS,
        }),
        canClaim: async () => true,
      };
    case 'llm':
      return {
        extractor: new LlmExtractor({
          llm: () => settings.clientForJob(),
          resolveFile: createFileResolver(
            new LocalDiskStorage(config.STORAGE_DIR),
            resolveFixturesDir(config),
          ),
          maxDocumentChars: config.MAX_DOCUMENT_CHARS,
        }),
        canClaim: () => settings.isConfigured(),
      };
  }
}
