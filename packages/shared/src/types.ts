import { z } from 'zod';
import { DOCUMENT_TYPES } from './fields.js';

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export const VERSION_STATUSES = ['queued', 'extracting', 'extracted', 'failed'] as const;
export const versionStatusSchema = z.enum(VERSION_STATUSES);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

export const REVIEW_STATES = ['pending', 'approved', 'corrected', 'carried_over'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Body of POST /values/:id/review */
export const reviewRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('correct'),
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
