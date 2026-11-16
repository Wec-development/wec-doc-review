import { describe, expect, it } from 'vitest';
import { blankPdf, FIXTURES_DIR } from '../../test/llm.js';
import { PermanentError } from '../errors.js';
import { NO_TEXT_REASON, parsePdfBytes, parsePdfFile } from './parse-pdf.js';

const fixture = (name: string) => `${FIXTURES_DIR}documents/${name}`;
const LIMIT = 100_000;

describe('parsePdfFile', () => {
  it.each([
    [
      'invoice-001.pdf',
      ['Invoice Number: INV-2025-0847', 'Subtotal: $4,815.00', 'Total Due: $5,230.29'],
    ],
    ['invoice-001.v2.pdf', ['INVOICE (REVISED)', 'Due Date: 2025-11-13', 'Total Due: $6,126.45']],
    [
      'lease-excerpt-001.pdf',
      ['Dana Okafor ("Tenant")', 'twenty-four (24)\nmonths', 'commencing on March 1, 2025'],
    ],
    [
      'market-report-excerpt-001.pdf',
      [
        'Reporting Period: Q3 2025',
        'declined to 4.2%, down from\n4.9%',
        'reached $1,985 per month',
      ],
    ],
  ])('reads %s with its lines intact', async (name, expectedLines) => {
    const text = await parsePdfFile(fixture(name), LIMIT);
    for (const line of expectedLines) {
      expect(text).toContain(line);
    }
  });

  it('is deterministic: the same file always gives the same text', async () => {
    const first = await parsePdfFile(fixture('invoice-001.pdf'), LIMIT);
    expect(await parsePdfFile(fixture('invoice-001.pdf'), LIMIT)).toBe(first);
  });

  it('fails permanently for a PDF without extractable text (scanned / image-only)', async () => {
    const parsing = parsePdfBytes(blankPdf(), LIMIT);
    await expect(parsing).rejects.toBeInstanceOf(PermanentError);
    await expect(parsing).rejects.toThrow(NO_TEXT_REASON);
  });

  it('fails permanently for bytes that are not a readable PDF', async () => {
    const parsing = parsePdfBytes(new TextEncoder().encode('%PDF-1.4\nnot really a pdf'), LIMIT);
    await expect(parsing).rejects.toBeInstanceOf(PermanentError);
    await expect(parsing).rejects.toThrow('PDF could not be read');
  });

  it('fails permanently when the text exceeds MAX_DOCUMENT_CHARS', async () => {
    await expect(parsePdfFile(fixture('invoice-001.pdf'), 100)).rejects.toThrow(
      'Document text exceeds the 100 character limit',
    );
  });

  it('fails permanently when the stored file is missing', async () => {
    await expect(parsePdfFile(fixture('missing.pdf'), LIMIT)).rejects.toThrow(
      'Stored PDF file not found',
    );
  });
});
