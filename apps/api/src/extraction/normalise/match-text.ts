/**
 * Text normalisation used ONLY to compare evidence with the parsed text. Both sides go through
 * exactly the same steps:
 *   1. Unicode NFKC (folds ligatures and full-width forms PDF parsers emit, e.g. "ﬁ" -> "fi")
 *   2. every whitespace run (spaces, tabs, CR, LF, CRLF) -> one space
 *   3. trim
 * Nothing else: no case folding, no punctuation or symbol stripping. The stored parsed text is
 * never modified; this only builds a comparison view with a map back to raw positions.
 */

export interface MatchText {
  text: string;
  /** For each UTF-16 unit of `text`: the raw start/end (exclusive) of the source characters. */
  rawStart: number[];
  rawEnd: number[];
}

// A base character with its combining marks, so NFKC can compose within the cluster.
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gsu;
const WHITESPACE = /^\s$/u;

export function toMatchText(raw: string): MatchText {
  let text = '';
  const rawStart: number[] = [];
  const rawEnd: number[] = [];
  let pendingSpace: { start: number; end: number } | null = null;

  const emit = (chars: string, start: number, end: number) => {
    text += chars;
    for (let i = 0; i < chars.length; i += 1) {
      rawStart.push(start);
      rawEnd.push(end);
    }
  };

  for (const match of raw.matchAll(CLUSTER)) {
    const start = match.index;
    const end = start + match[0].length;
    for (const char of match[0].normalize('NFKC')) {
      if (WHITESPACE.test(char)) {
        // Leading whitespace is dropped (trim); inner runs collapse into one pending space.
        if (text.length > 0) {
          pendingSpace = pendingSpace ? { start: pendingSpace.start, end } : { start, end };
        }
        continue;
      }
      if (pendingSpace) {
        emit(' ', pendingSpace.start, pendingSpace.end);
        pendingSpace = null;
      }
      emit(char, start, end);
    }
  }
  // A trailing pending space is never emitted (trim).
  return { text, rawStart, rawEnd };
}

export function normaliseForMatching(raw: string): string {
  return toMatchText(raw).text;
}

export interface EvidenceLocation {
  /** Raw offsets (end exclusive) of the matched passage in the original text. */
  start: number;
  end: number;
  /** The exact raw substring, as stored for the value. */
  passage: string;
}

/**
 * Finds `evidence` in `text` after normalising both identically. Returns the first occurrence
 * mapped back to raw offsets, or null when it does not appear (or is empty after normalising).
 */
export function locateEvidence(text: string, evidence: string): EvidenceLocation | null {
  const needle = normaliseForMatching(evidence);
  if (needle.length === 0) {
    return null;
  }
  const haystack = toMatchText(text);
  const index = haystack.text.indexOf(needle);
  if (index === -1) {
    return null;
  }
  const start = haystack.rawStart[index];
  const end = haystack.rawEnd[index + needle.length - 1];
  if (start === undefined || end === undefined) {
    return null;
  }
  return { start, end, passage: text.slice(start, end) };
}
