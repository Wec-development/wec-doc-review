import type { Config } from '../config.js';
import type { Extractor } from './extractor.js';
import { FakeExtractor } from './fake-extractor.js';

/** Selects the extractor from config. The LLM extractor arrives in Step 6. */
export function createExtractor(config: Config): Extractor {
  switch (config.EXTRACTOR) {
    case 'fake':
      return new FakeExtractor({
        behavior: config.FAKE_EXTRACTOR_BEHAVIOR,
        delayMs: config.FAKE_EXTRACTOR_DELAY_MS,
      });
    case 'llm':
      throw new Error('EXTRACTOR=llm is not available yet (Step 6); use EXTRACTOR=fake');
  }
}
