import type { FieldKind } from '@doc-review/shared';
import { normaliseForMatching } from '../normalise/match-text.js';
import {
  findDates,
  normaliseValue,
  numberTokens,
  readNumber,
} from '../normalise/normalise-value.js';

/**
 * Is the value actually stated by its evidence? Evidence that exists in the document but says
 * something else (e.g. the model quoted the subtotal line and reported the total) must not pass.
 *   - any type: the value itself appears in the evidence (same match normalisation, case-insensitive)
 *   - money / number / percent: the value's number appears among the evidence's numbers
 *   - date: the evidence contains the same calendar date in any supported format
 */
export function isValueSupportedByEvidence(
  type: FieldKind,
  value: string,
  evidence: string,
): boolean {
  const valueText = normaliseForMatching(value).toLowerCase();
  const evidenceText = normaliseForMatching(evidence).toLowerCase();
  if (valueText.length > 0 && evidenceText.includes(valueText)) {
    return true;
  }

  switch (type) {
    case 'money':
    case 'number':
    case 'percent': {
      const number = readNumber(value);
      return number !== null && numberTokens(evidence).includes(number);
    }
    case 'date': {
      const date = normaliseValue('date', value);
      return date !== null && findDates(evidence).includes(date);
    }
    case 'string':
      return false;
  }
}
