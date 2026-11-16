import { z } from 'zod';
import { DOCUMENT_TYPES } from './fields.js';

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

/**
 * `superseded` is only ever set on an older version whose extraction was cancelled because a
 * newer version arrived; the current version is always one of the other four.
 */
export const VERSION_STATUSES = [
  'queued',
  'extracting',
  'extracted',
  'failed',
  'superseded',
] as const;
export const versionStatusSchema = z.enum(VERSION_STATUSES);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

/** Versions still waiting on (or running) an extraction; a newer upload supersedes them. */
export const IN_FLIGHT_VERSION_STATUSES = [
  'queued',
  'extracting',
] as const satisfies readonly VersionStatus[];

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'superseded'] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** A version may have at most one job in these statuses at a time (enforced by a partial unique index). */
export const OPEN_JOB_STATUSES = ['queued', 'running'] as const satisfies readonly JobStatus[];

export const REVIEW_ACTIONS = ['approve', 'correct'] as const;
export const reviewActionSchema = z.enum(REVIEW_ACTIONS);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const REVIEW_STATES = ['pending', 'approved', 'corrected', 'carried_over'] as const;
export const reviewStateSchema = z.enum(REVIEW_STATES);
export type ReviewState = z.infer<typeof reviewStateSchema>;

/** The review action behind a carried-over value. */
export const CARRIED_ACTIONS = ['approved', 'corrected'] as const;
export const carriedActionSchema = z.enum(CARRIED_ACTIONS);
export type CarriedAction = z.infer<typeof carriedActionSchema>;

/** Why a field is a gap; decides whether a gap can count as "unchanged" across versions. */
export const GAP_KINDS = [
  'not_found',
  'evidence_not_verified',
  'not_supported',
  'not_normalisable',
  'not_returned',
] as const;
export const gapKindSchema = z.enum(GAP_KINDS);
export type GapKind = z.infer<typeof gapKindSchema>;

/** How a value relates to the same field on the baseline (previous extracted) version. */
export const COMPARISONS = ['initial', 'unchanged', 'changed', 'added'] as const;
export const comparisonSchema = z.enum(COMPARISONS);
export type Comparison = z.infer<typeof comparisonSchema>;

export const COMPARISON_REASONS = [
  'evidence_matches',
  'still_not_found',
  'value_differs',
  'baseline_evidence_missing',
  'candidate_evidence_missing',
  'became_gap',
  'gap_resolved',
  'gap_kind_changed',
  'no_baseline_value',
] as const;
export const comparisonReasonSchema = z.enum(COMPARISON_REASONS);
export type ComparisonReason = z.infer<typeof comparisonReasonSchema>;

const [APPROVE, CORRECT] = REVIEW_ACTIONS;

/** Body of POST /values/:id/review */
export const reviewRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal(APPROVE) }),
  z.object({
    action: z.literal(CORRECT),
    value: z.string().trim().min(1, 'A corrected value is required'),
    note: z.string().trim().max(1000).optional(),
  }),
]);
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
