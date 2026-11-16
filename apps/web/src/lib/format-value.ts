import { type DocumentType, EXPECTED_FIELDS, type FieldKind } from '@doc-review/shared';

export interface FormattedValue {
  /** The value as shown large on a card. */
  text: string;
  /** A unit shown beside it, e.g. a currency code. */
  unit: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

/** The field's type from the shared field definitions (string for unknown fields). */
export function fieldKind(documentType: DocumentType, field: string): FieldKind {
  return (
    EXPECTED_FIELDS[documentType].find((definition) => definition.field === field)?.type ?? 'string'
  );
}

function groupThousands(decimal: string): string {
  const [whole = '0', fraction] = decimal.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

function formatMoney(normalized: string): FormattedValue {
  const [amount = normalized, currency] = normalized.split(' ');
  const symbol = currency ? (CURRENCY_SYMBOLS[currency] ?? '') : '';
  const cents = amount.includes('.') ? amount.padEnd(amount.indexOf('.') + 3, '0') : amount;
  return { text: `${symbol}${groupThousands(cents)}`, unit: currency ?? null };
}

/**
 * Display form of a value by field type, from the API's normalised value (e.g. "6126.45 USD"
 * -> "$6,126.45" + "USD", "4.2" -> "4.2%"). Falls back to the value as written.
 */
export function formatValue(
  kind: FieldKind,
  value: string | null,
  normalizedValue: string | null,
): FormattedValue {
  if (value === null) return { text: 'No value', unit: null };
  if (normalizedValue === null) return { text: value, unit: null };
  switch (kind) {
    case 'money':
      return formatMoney(normalizedValue);
    case 'percent':
      return { text: `${normalizedValue}%`, unit: null };
    case 'number':
      return { text: groupThousands(normalizedValue), unit: null };
    case 'date':
      return { text: normalizedValue, unit: null };
    case 'string':
      return { text: value, unit: null };
  }
}
