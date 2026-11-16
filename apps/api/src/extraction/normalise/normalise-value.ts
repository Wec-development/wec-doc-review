import type { FieldKind } from '@doc-review/shared';

/**
 * Canonical forms by field type, so values compare reliably (UI display, carry-over in Step 7):
 *   date    -> YYYY-MM-DD           ("March 1, 2025" -> "2025-03-01")
 *   money   -> decimal [+ currency] ("$5,230.29" -> "5230.29 USD", "$1,985" -> "1985 USD")
 *   percent -> decimal              ("4.2%" -> "4.2")
 *   number  -> decimal              ("twenty-four (24)" -> "24")
 *   string  -> whitespace collapsed and trimmed
 * Each returns null when the value cannot be read unambiguously as its type.
 */

// Digits with optional thousands separators and decimals: 5,230.29 | 1985 | 4.2 | 0.5.
// A token never starts or ends inside a longer number, so "1.200,50" yields no token rather
// than a misleading "1" (a sentence-ending "." is fine: "$1,985.").
const NUMBER_TOKEN =
  /(?<![\d.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,]|\.\d)|(?<![\d.,])\d+(?:\.\d+)?(?![\d,]|\.\d)/g;

/** "5,230.290" -> "5230.29", "2,350.00" -> "2350", "007" -> "7". String-based: no float error. */
export function canonicalDecimal(token: string): string {
  const plain = token.replaceAll(',', '');
  const [whole = '0', fraction = ''] = plain.split('.');
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${trimmedWhole}.${trimmedFraction}` : trimmedWhole;
}

/** All numbers written with digits, in canonical form. */
export function numberTokens(text: string): string[] {
  return [...text.matchAll(NUMBER_TOKEN)].map((match) => canonicalDecimal(match[0]));
}

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** "twenty-four" -> 24, "one hundred twelve" -> 112; null if any word is not a number word. */
export function parseNumberWords(text: string): number | null {
  const words = text
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== 'and');
  if (words.length === 0) return null;
  let total = 0;
  for (const word of words) {
    if (word in UNITS) total += UNITS[word] ?? 0;
    else if (word in TENS) total += TENS[word] ?? 0;
    else if (word === 'hundred' && total > 0) total *= 100;
    else return null;
  }
  return total;
}

/** The single number a value states; null if it states none or several different ones. */
export function readNumber(value: string): string | null {
  const distinct = [...new Set(numberTokens(value))];
  if (distinct.length === 1) return distinct[0] ?? null;
  if (distinct.length > 1) return null;
  const words = parseNumberWords(value.replace(/[^A-Za-z\s-]/g, ' ').trim());
  return words === null ? null : String(words);
}

const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR', 'NZD', 'SGD'];
const CURRENCY_SYMBOLS: [RegExp, string][] = [
  [/US\$|\$/, 'USD'], // "$" is read as US dollars; documents in other dollar currencies say so.
  [/€/, 'EUR'],
  [/£/, 'GBP'],
  [/¥/, 'JPY'],
  [/₹/, 'INR'],
];

export function detectCurrency(value: string): string | null {
  const code = CURRENCY_CODES.find((c) => new RegExp(`\\b${c}\\b`).test(value));
  if (code) return code;
  return CURRENCY_SYMBOLS.find(([symbol]) => symbol.test(value))?.[1] ?? null;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTH_NAME =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';

function monthNumber(name: string): number {
  return MONTHS.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3))) + 1;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Date patterns accepted, each mapped to an ISO date. Numeric slash dates are read as US
 * month/day/year (the fixtures are US documents); ISO is unambiguous.
 */
const DATE_PATTERNS: { regex: RegExp; toIso: (m: RegExpMatchArray) => string | null }[] = [
  {
    regex: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/gi,
    toIso: (m) => isoDate(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  {
    regex: new RegExp(`\\b${MONTH_NAME}\\s+${DAY},?\\s+(\\d{4})\\b`, 'gi'),
    toIso: (m) => isoDate(Number(m[3]), monthNumber(m[1] ?? ''), Number(m[2])),
  },
  {
    regex: new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH_NAME},?\\s+(\\d{4})\\b`, 'gi'),
    toIso: (m) => isoDate(Number(m[3]), monthNumber(m[2] ?? ''), Number(m[1])),
  },
  {
    regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    toIso: (m) => isoDate(Number(m[3]), Number(m[1]), Number(m[2])),
  },
];

/** Every date written in the text, as ISO strings. */
export function findDates(text: string): string[] {
  return DATE_PATTERNS.flatMap(({ regex, toIso }) =>
    [...text.matchAll(regex)].map(toIso).filter((iso): iso is string => iso !== null),
  );
}

function normaliseDate(value: string): string | null {
  const distinct = [...new Set(findDates(value))];
  return distinct.length === 1 ? (distinct[0] ?? null) : null;
}

function normaliseMoney(value: string): string | null {
  const amount = readNumber(value);
  if (amount === null) return null;
  const currency = detectCurrency(value);
  return currency ? `${amount} ${currency}` : amount;
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normaliseValue(type: FieldKind, value: string): string | null {
  switch (type) {
    case 'date':
      return normaliseDate(value);
    case 'money':
      return normaliseMoney(value);
    case 'percent':
      return readNumber(value);
    case 'number':
      return readNumber(value);
    case 'string': {
      const collapsed = collapseWhitespace(value);
      return collapsed.length > 0 ? collapsed : null;
    }
  }
}
