export type HighlightTone = 'pending' | 'neutral';

export interface HighlightRange {
  /** Start/end (end exclusive) in the text, as returned by the API. */
  start: number;
  end: number;
  /** Identifies the value, so its card can scroll to it. */
  key: string;
  tone: HighlightTone;
}

export interface Segment {
  text: string;
  start: number;
  highlight: { key: string; tone: HighlightTone } | null;
}

function isUsable(range: HighlightRange, length: number): boolean {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.end <= length &&
    range.end > range.start
  );
}

/**
 * Splits text into plain and highlighted segments. Invalid or out-of-range ranges are ignored;
 * where ranges overlap, the earlier one keeps the overlap and the later one is trimmed (or
 * dropped if nothing is left), so every character appears exactly once.
 */
export function highlightSegments(text: string, ranges: readonly HighlightRange[]): Segment[] {
  const usable = ranges
    .filter((range) => isUsable(range, text.length))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of usable) {
    const start = Math.max(range.start, cursor);
    if (start >= range.end) continue;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), start: cursor, highlight: null });
    }
    segments.push({
      text: text.slice(start, range.end),
      start,
      highlight: { key: range.key, tone: range.tone },
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), start: cursor, highlight: null });
  }
  return segments;
}

/** 1-based line number of a character offset (for "Source quote · v2, line 7"). */
export function lineOfOffset(text: string, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return null;
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Highlight ranges for a version's values: amber while a value still needs review on the
 * current version, neutral once reviewed or carried over (and on older, read-only versions).
 */
export function valueHighlights(
  values: readonly {
    id: string;
    evidenceStart: number | null;
    evidenceEnd: number | null;
    reviewState: string;
  }[],
  readOnly: boolean,
): HighlightRange[] {
  return values.flatMap((value) =>
    value.evidenceStart === null || value.evidenceEnd === null
      ? []
      : [
          {
            start: value.evidenceStart,
            end: value.evidenceEnd,
            key: value.id,
            tone:
              !readOnly && value.reviewState === 'pending'
                ? ('pending' as const)
                : ('neutral' as const),
          },
        ],
  );
}
