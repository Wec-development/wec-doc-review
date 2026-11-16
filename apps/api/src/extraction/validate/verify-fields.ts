import {
  type DocumentType,
  EXPECTED_FIELDS,
  type ExtractedField,
  type FieldKind,
  type GapKind,
} from '@doc-review/shared';
import { locateEvidence } from '../normalise/match-text.js';
import { normaliseValue } from '../normalise/normalise-value.js';
import type { ModelField } from './parse-model-output.js';
import { isValueSupportedByEvidence } from './value-support.js';

/** Gap reasons, shown to reviewers. */
export const GAP_REASONS = {
  notReturned: 'Not returned by the model',
  notFound: 'Not found in document',
  noEvidence: 'No evidence quoted for the value',
  evidenceNotFound: 'Quoted evidence not found in document text',
  notSupported: 'Value not supported by its evidence',
  notNormalisable: (type: FieldKind) => `Value could not be normalised as ${type}`,
} as const;

function gap(field: string, kind: GapKind, reason: string): ExtractedField {
  return {
    field,
    gapKind: kind,
    value: null,
    normalizedValue: null,
    evidence: null,
    evidenceStart: null,
    evidenceEnd: null,
    gapReason: reason,
  };
}

/**
 * The hallucination defence. Turns the model's claims into values only when the code can verify
 * them against THIS version's parsed text; everything else becomes a gap with a reason. The
 * model is never trusted: each rule below is checked here.
 */
export function verifyField(
  type: FieldKind,
  field: string,
  claim: ModelField | undefined,
  parsedText: string,
): ExtractedField {
  if (!claim) {
    return gap(field, 'not_returned', GAP_REASONS.notReturned);
  }
  if (claim.value === null || claim.value.trim() === '') {
    return gap(field, 'not_found', claim.not_found_reason?.trim() || GAP_REASONS.notFound);
  }
  if (claim.evidence === null || claim.evidence.trim() === '') {
    return gap(field, 'evidence_not_verified', GAP_REASONS.noEvidence);
  }
  const location = locateEvidence(parsedText, claim.evidence);
  if (!location) {
    return gap(field, 'evidence_not_verified', GAP_REASONS.evidenceNotFound);
  }
  if (!isValueSupportedByEvidence(type, claim.value, location.passage)) {
    return gap(field, 'not_supported', GAP_REASONS.notSupported);
  }
  const normalizedValue = normaliseValue(type, claim.value);
  if (normalizedValue === null) {
    return gap(field, 'not_normalisable', GAP_REASONS.notNormalisable(type));
  }
  return {
    field,
    value: claim.value.trim(),
    normalizedValue,
    // Stored as the exact passage from the document, not the model's copy of it.
    evidence: location.passage,
    evidenceStart: location.start,
    evidenceEnd: location.end,
    gapReason: null,
    gapKind: null,
  };
}

/** One verified result per expected field, in the shared field order. */
export function verifyFields(
  documentType: DocumentType,
  claims: Map<string, ModelField | undefined>,
  parsedText: string,
): ExtractedField[] {
  return EXPECTED_FIELDS[documentType].map(({ field, type }) =>
    verifyField(type, field, claims.get(field), parsedText),
  );
}
