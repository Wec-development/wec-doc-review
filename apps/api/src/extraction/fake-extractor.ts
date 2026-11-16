import {
  type DocumentType,
  EXPECTED_FIELDS,
  type ExtractedField,
  type ExtractionResult,
} from '@doc-review/shared';
import { ExtractionError } from './errors.js';
import type { ExtractionInput, Extractor } from './extractor.js';

export type FakeBehavior = 'succeed' | 'retryable' | 'permanent';

export interface FakeExtractorOptions {
  behavior?: FakeBehavior;
  /** Simulated LLM latency; honours the abort signal. */
  delayMs?: number;
  /** Fail retryably this many times before following `behavior` (for retry tests). */
  failuresBeforeSuccess?: number;
}

/** Plausible, deterministic values per document type. */
const FAKE_VALUES: Record<DocumentType, Record<string, string | null>> = {
  invoice: {
    invoice_number: 'INV-1001',
    issue_date: '2025-03-01',
    due_date: '2025-03-31',
    vendor_name: 'Meridian Office Supplies',
    total_amount: '$1,250.00',
  },
  lease: {
    tenant_name: 'Jordan Lee',
    monthly_rent: '$2,150.00',
    security_deposit: '$2,150.00',
    lease_start: '2025-04-01',
    term_months: '12',
  },
  market_report: {
    report_quarter: 'Q3',
    market_area: 'Eastport',
    vacancy_rate: '5.2%',
    average_rent_1br: '$1,825',
    year_over_year_rent_growth: '3.1%',
    // Mirrors the fixture: the report does not state household income.
    median_household_income: null,
  },
};

function fakeFields(type: DocumentType): ExtractedField[] {
  return EXPECTED_FIELDS[type].map(({ field }) => {
    const value = FAKE_VALUES[type][field] ?? null;
    return value === null
      ? { field, value: null, evidence: null, gapReason: 'Not stated in the document (fake)' }
      : { field, value, evidence: `${field.replaceAll('_', ' ')}: ${value}`, gapReason: null };
  });
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Deterministic stand-in for the LLM extractor (Step 6). Never reads the file. */
export class FakeExtractor implements Extractor {
  private remainingFailures: number;

  constructor(private readonly options: FakeExtractorOptions = {}) {
    this.remainingFailures = options.failuresBeforeSuccess ?? 0;
  }

  async extract({ documentType, signal }: ExtractionInput): Promise<ExtractionResult> {
    await abortableDelay(this.options.delayMs ?? 0, signal);

    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw new ExtractionError('Fake extractor: simulated rate limit', { retryable: true });
    }
    if (this.options.behavior === 'retryable') {
      throw new ExtractionError('Fake extractor: simulated timeout', { retryable: true });
    }
    if (this.options.behavior === 'permanent') {
      throw new ExtractionError('Fake extractor: simulated unreadable PDF', { retryable: false });
    }

    const fields = fakeFields(documentType);
    return {
      fields,
      prompt: `fake prompt: extract ${fields.map((f) => f.field).join(', ')}`,
      rawResponse: { extractor: 'fake', fields },
      parsedText: fields
        .map((f) => f.evidence)
        .filter((evidence) => evidence !== null)
        .join('\n'),
    };
  }
}
