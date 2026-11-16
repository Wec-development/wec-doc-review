import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DocumentType, ExtractionResult } from '@doc-review/shared';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { FIXTURES_DIR } from '../test/llm.js';
import { LlmExtractor } from './llm-extractor.js';
import { createLlmClient } from './llm/create-llm-client.js';

/**
 * Calls the REAL provider. Never part of `pnpm test` or CI; run with `pnpm test:live`
 * (LLM_LIVE_TEST=1, key and model from .env). LLM_RECORD=1 also saves each raw response to
 * test/recordings/ (Anthropic) or test/recordings/<provider>/ for the golden tests.
 */
const RECORDINGS_DIR = fileURLToPath(new URL('../../test/recordings/', import.meta.url));

/** Anthropic replies are the golden recordings; other providers' replies go in a subfolder. */
function recordingPrefix(): string {
  const provider = loadConfig().LLM_PROVIDER;
  return provider === 'anthropic' ? '' : `${provider ?? 'unknown'}/`;
}

function liveExtractor(): LlmExtractor {
  if (process.env.LLM_LIVE_TEST !== '1') {
    throw new Error('Live tests run only with LLM_LIVE_TEST=1 (use `pnpm test:live`)');
  }
  const config = loadConfig();
  if (!config.LLM_API_KEY || !config.LLM_MODEL) {
    throw new Error('Live tests need LLM_API_KEY and LLM_MODEL (in .env or the shell)');
  }
  return new LlmExtractor({
    llm: createLlmClient(config),
    resolveFile: (filePath) => `${FIXTURES_DIR}${filePath.replace(/^fixtures\//, '')}`,
    maxDocumentChars: config.MAX_DOCUMENT_CHARS,
  });
}

async function extractLive(type: DocumentType, pdf: string, recording: string) {
  const result: ExtractionResult = await liveExtractor().extract({
    versionId: '00000000-0000-4000-8000-000000000000',
    documentType: type,
    filePath: `fixtures/documents/${pdf}`,
    signal: AbortSignal.timeout(170_000),
  });
  const gaps = result.fields.filter((f) => f.value === null);
  console.info(
    JSON.stringify({
      document: pdf,
      model: result.model,
      promptVersion: result.promptVersion,
      usage: result.usage,
      durationMs: result.durationMs,
      values: result.fields.length - gaps.length,
      gaps: gaps.map((g) => `${g.field}: ${g.gapReason}`),
      normalized: Object.fromEntries(result.fields.map((f) => [f.field, f.normalizedValue])),
    }),
  );
  if (process.env.LLM_RECORD === '1') {
    mkdirSync(`${RECORDINGS_DIR}${recordingPrefix()}`, { recursive: true });
    writeFileSync(
      `${RECORDINGS_DIR}${recordingPrefix()}${recording}.json`,
      `${JSON.stringify(result.rawResponse, null, 2)}\n`,
    );
  }
  return new Map(result.fields.map((f) => [f.field, f]));
}

describe('live LLM extraction', () => {
  it('extracts invoice-001.pdf with verified evidence', async () => {
    const fields = await extractLive('invoice', 'invoice-001.pdf', 'invoice-001');
    expect(fields.get('invoice_number')?.normalizedValue).toBe('INV-2025-0847');
    expect(fields.get('total_amount')?.normalizedValue).toBe('5230.29 USD');
  });

  it.runIf(process.env.LLM_RECORD === '1')('records the lease and market report', async () => {
    const lease = await extractLive('lease', 'lease-excerpt-001.pdf', 'lease-excerpt-001');
    expect(lease.get('term_months')?.normalizedValue).toBe('24');
    const report = await extractLive(
      'market_report',
      'market-report-excerpt-001.pdf',
      'market-report-excerpt-001',
    );
    expect(report.get('median_household_income')?.value).toBeNull();
  });
});
