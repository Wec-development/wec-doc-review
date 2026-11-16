import type { Config } from '../config.js';
import { resolveFixturesDir } from '../fixtures-dir.js';
import { LocalDiskStorage } from '../storage/file-storage.js';
import type { Extractor } from './extractor.js';
import { FakeExtractor } from './fake-extractor.js';
import { createLlmClient } from './llm/create-llm-client.js';
import { LlmExtractor } from './llm-extractor.js';
import { createFileResolver } from './resolve-file.js';

/** Selects the extractor from config; fails fast (worker start) when `llm` is misconfigured. */
export function createExtractor(config: Config): Extractor {
  switch (config.EXTRACTOR) {
    case 'fake':
      return new FakeExtractor({
        behavior: config.FAKE_EXTRACTOR_BEHAVIOR,
        delayMs: config.FAKE_EXTRACTOR_DELAY_MS,
      });
    case 'llm': {
      return new LlmExtractor({
        llm: createLlmClient(config),
        resolveFile: createFileResolver(
          new LocalDiskStorage(config.STORAGE_DIR),
          resolveFixturesDir(config),
        ),
        maxDocumentChars: config.MAX_DOCUMENT_CHARS,
      });
    }
  }
}
