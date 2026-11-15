import { z } from 'zod';
import { DOCUMENT_TYPES } from './fields.js';

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export const VERSION_STATUSES = ['queued', 'extracting', 'extracted', 'failed'] as const;
export const versionStatusSchema = z.enum(VERSION_STATUSES);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'superseded'] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** A version may have at most one job in these statuses at a time (enforced by a partial unique index). */
export const OPEN_JOB_STATUSES = ['queued', 'running'] as const satisfies readonly JobStatus[];

export const REVIEW_ACTIONS = ['approve', 'correct'] as const;
export const reviewActionSchema = z.enum(REVIEW_ACTIONS);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const REVIEW_STATES = ['pending', 'approved', 'corrected', 'carried_over'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

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

/** Response of GET /documents/:id/progress */
export interface ReviewProgress {
  pending: number;
  approved: number;
  corrected: number;
  carriedOver: number;
  gaps: number;
}
