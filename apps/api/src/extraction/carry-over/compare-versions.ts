import type {
  Comparison,
  ComparisonReason,
  ExtractedField,
  GapKind,
  ReviewAction,
} from '@doc-review/shared';
import { normaliseForMatching } from '../normalise/match-text.js';
import { collapseWhitespace } from '../normalise/normalise-value.js';

export interface BaselineReview {
  id: string;
  action: ReviewAction;
  correctedValue: string | null;
  note: string | null;
  reviewer: string;
}

export interface BaselineValue {
  id: string;
  field: string;
  value: string | null;
  normalizedValue: string | null;
  evidence: string | null;
  gapKind: GapKind | null;
  /** The value's current (latest) review, carried as-is when the field is unchanged. */
  latestReview: BaselineReview | null;
}

export interface BaselineSnapshot {
  parsedText: string | null;
  values: BaselineValue[];
}

export interface CandidateSnapshot {
  parsedText: string | null;
  fields: ExtractedField[];
}

export interface FieldComparison {
  field: string;
  comparison: Comparison;
  reason: ComparisonReason | null;
  /** The same field on the baseline version, linked whether or not it changed. */
  previousValueId: string | null;
  /** Set only for unchanged fields whose baseline value was reviewed. */
  carryReview: BaselineReview | null;
}

interface Side {
  value: string | null;
  normalizedValue?: string | null;
  evidence: string | null;
  gapKind?: GapKind | null;
}

/** Normalised text, so evidence look-ups are a plain substring check (no offsets involved). */
class SearchableText {
  private readonly normalised: string | null;

  constructor(text: string | null) {
    this.normalised = text === null ? null : normaliseForMatching(text);
  }

  contains(evidence: string | null): boolean {
    if (this.normalised === null || evidence === null) return false;
    const needle = normaliseForMatching(evidence);
    return needle.length > 0 && this.normalised.includes(needle);
  }
}

function comparableValue(side: Side): string {
  return side.normalizedValue ?? collapseWhitespace(side.value ?? '');
}

/** A gap with no kind predates gap kinds; the model said the field was not there. */
function kindOf(side: Side): GapKind {
  return side.gapKind ?? 'not_found';
}

/**
 * The "unchanged" rule for one field (see README: Re-extraction and carry-over).
 * Two values are unchanged when their normalised values are equal AND each version's evidence
 * appears verbatim (same normalisation as evidence verification) in the OTHER version's text.
 * Positions are never compared, so moved or reflowed text does not count as a change.
 */
function compareField(
  baseline: Side,
  candidate: Side,
  baselineText: SearchableText,
  candidateText: SearchableText,
): { comparison: Comparison; reason: ComparisonReason } {
  const baselineIsGap = baseline.value === null;
  const candidateIsGap = candidate.value === null;

  if (baselineIsGap && candidateIsGap) {
    // Only "genuinely absent in both" is stable; any verification failure needs a human again.
    return kindOf(baseline) === 'not_found' && kindOf(candidate) === 'not_found'
      ? { comparison: 'unchanged', reason: 'still_not_found' }
      : { comparison: 'changed', reason: 'gap_kind_changed' };
  }
  if (candidateIsGap) return { comparison: 'changed', reason: 'became_gap' };
  if (baselineIsGap) return { comparison: 'changed', reason: 'gap_resolved' };

  if (comparableValue(baseline) !== comparableValue(candidate)) {
    return { comparison: 'changed', reason: 'value_differs' };
  }
  if (!candidateText.contains(baseline.evidence)) {
    return { comparison: 'changed', reason: 'baseline_evidence_missing' };
  }
  if (!baselineText.contains(candidate.evidence)) {
    return { comparison: 'changed', reason: 'candidate_evidence_missing' };
  }
  return { comparison: 'unchanged', reason: 'evidence_matches' };
}

/**
 * Compares a newly extracted version (candidate) with the baseline (the latest earlier
 * extracted version) field by field. Pure: no I/O, so every rule is unit-tested directly.
 * With no baseline every field is `initial`; a field the baseline lacks is `added`.
 */
export function compareVersions(
  baseline: BaselineSnapshot | null,
  candidate: CandidateSnapshot,
): FieldComparison[] {
  if (baseline === null) {
    return candidate.fields.map(({ field }) => ({
      field,
      comparison: 'initial',
      reason: null,
      previousValueId: null,
      carryReview: null,
    }));
  }

  const baselineByField = new Map(baseline.values.map((value) => [value.field, value]));
  const baselineText = new SearchableText(baseline.parsedText);
  const candidateText = new SearchableText(candidate.parsedText);

  return candidate.fields.map((field) => {
    const previous = baselineByField.get(field.field);
    if (!previous) {
      return {
        field: field.field,
        comparison: 'added',
        reason: 'no_baseline_value',
        previousValueId: null,
        carryReview: null,
      };
    }
    const { comparison, reason } = compareField(previous, field, baselineText, candidateText);
    return {
      field: field.field,
      comparison,
      reason,
      previousValueId: previous.id,
      carryReview: comparison === 'unchanged' ? previous.latestReview : null,
    };
  });
}
