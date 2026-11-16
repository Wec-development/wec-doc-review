import {
  DOCUMENT_TYPES,
  JOB_STATUSES,
  OPEN_JOB_STATUSES,
  REVIEW_ACTIONS,
  type ReviewState,
  VERSION_STATUSES,
} from '@doc-review/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Enum values come from packages/shared so the API, the UI and the database cannot drift apart.
export const documentType = pgEnum('document_type', DOCUMENT_TYPES);
export const versionStatus = pgEnum('version_status', VERSION_STATUSES);
export const jobStatus = pgEnum('job_status', JOB_STATUSES);
export const reviewAction = pgEnum('review_action', REVIEW_ACTIONS);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Rows are never deleted, so every foreign key refuses deletes of referenced rows.
const RESTRICT = { onDelete: 'restrict', onUpdate: 'restrict' } as const;

const openJobStatusList = sql.raw(OPEN_JOB_STATUSES.map((status) => `'${status}'`).join(', '));

/**
 * One logical document. Its current version is the highest version_no: deriving it avoids a
 * circular documents <-> document_versions foreign key that could point at the wrong row.
 */
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: documentType('type').notNull(),
  title: text('title').notNull(),
  // Identifies rows created from fixtures/documents.json so the seed can skip them on re-run.
  fixtureKey: text('fixture_key').unique('documents_fixture_key_uq'),
  createdAt: createdAt(),
});

/** One uploaded PDF. Versions are append-only and keep their own parsed text. */
export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, RESTRICT),
    versionNo: integer('version_no').notNull(),
    // Storage key, relative to STORAGE_DIR (seeded fixtures: relative to the repo root).
    filePath: text('file_path').notNull(),
    // Hex SHA-256 of the PDF bytes; null only for rows seeded before uploads recorded it.
    fileSha256: text('file_sha256'),
    parsedText: text('parsed_text'),
    status: versionStatus('status').notNull().default('queued'),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('document_versions_document_version_uq').on(table.documentId, table.versionNo),
    check('document_versions_version_no_positive', sql`${table.versionNo} > 0`),
  ],
);

/** The job queue (claimed by the worker) and the debug log of each extraction attempt. */
export const extractionJobs = pgTable(
  'extraction_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => documentVersions.id, RESTRICT),
    status: jobStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    // Lease: the worker in locked_by owns the job until locked_until (database clock). Every
    // write that finishes an attempt is fenced on (status = 'running', locked_by = worker).
    lockedBy: text('locked_by'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    // Backoff: a re-queued job is not claimable before this time.
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    lastError: text('last_error'),
    prompt: text('prompt'),
    rawResponse: jsonb('raw_response'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('extraction_jobs_one_open_per_version')
      .on(table.versionId)
      .where(sql`${table.status} in (${openJobStatusList})`),
    // The two halves of the claim query: due queued jobs, and running jobs with expired leases.
    index('extraction_jobs_claim_queued_idx')
      .on(table.runAfter, table.createdAt)
      .where(sql`${table.status} = 'queued'`),
    index('extraction_jobs_claim_expired_idx')
      .on(table.lockedUntil)
      .where(sql`${table.status} = 'running'`),
    check(
      'extraction_jobs_running_has_lease',
      sql`${table.status} <> 'running' or (${table.lockedBy} is not null and ${table.lockedUntil} is not null)`,
    ),
  ],
);

/** One value per field per version: either a value with its evidence, or a gap with a reason. */
export const extractedValues = pgTable(
  'extracted_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => documentVersions.id, RESTRICT),
    field: text('field').notNull(),
    value: text('value'),
    evidence: text('evidence'),
    gapReason: text('gap_reason'),
    previousValueId: uuid('previous_value_id').references(
      (): AnyPgColumn => extractedValues.id,
      RESTRICT,
    ),
    carriedOver: boolean('carried_over').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    unique('extracted_values_version_field_uq').on(table.versionId, table.field),
    check(
      'extracted_values_value_or_gap',
      sql`(${table.value} is not null and ${table.evidence} is not null) or (${table.value} is null and ${table.gapReason} is not null)`,
    ),
  ],
);

/**
 * Approvals and corrections. A correction lives beside the extracted value, which is never
 * overwritten; the latest review per value is the current one.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    valueId: uuid('value_id')
      .notNull()
      .references(() => extractedValues.id, RESTRICT),
    action: reviewAction('action').notNull(),
    correctedValue: text('corrected_value'),
    note: text('note'),
    reviewer: text('reviewer').notNull().default('reviewer'),
    // clock_timestamp(), not now(): reviews written in one transaction still get distinct,
    // ordered times, so "the latest review wins" is deterministic.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    check(
      'reviews_correct_needs_value',
      sql`${table.action} <> 'correct' or ${table.correctedValue} is not null`,
    ),
    index('reviews_value_created_idx').on(table.valueId, table.createdAt),
  ],
);

/**
 * The single definition of a value's review state, used by the document list, the detail view
 * and progress. Created by migration 0002 (drizzle-kit does not manage views marked existing).
 * - carried_over: the value was carried over from the previous version
 * - otherwise the latest review decides: approve -> approved, correct -> corrected
 * - no review: pending
 */
export const valueReviewStates = pgView('value_review_states', {
  valueId: uuid('value_id').notNull(),
  versionId: uuid('version_id').notNull(),
  isGap: boolean('is_gap').notNull(),
  reviewState: text('review_state').$type<ReviewState>().notNull(),
  reviewAction: reviewAction('review_action'),
  correctedValue: text('corrected_value'),
  note: text('note'),
  reviewer: text('reviewer'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}).existing();
