import type { DocumentType, ExtractionResult } from '@doc-review/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Database, Executor } from '../db/client.js';
import { documentVersions, extractedValues, extractionJobs } from '../db/schema.js';
import { findLatestVersion, lockDocument } from './documents.repository.js';

/**
 * The Postgres job queue. Lease decisions always use the database clock (now()); Node only
 * supplies durations. Every write that ends or hands back an attempt is fenced on
 * (status = 'running' AND locked_by = workerId): a worker that lost its lease changes nothing.
 */

export interface ClaimedJob {
  jobId: string;
  versionId: string;
  documentId: string;
  documentType: DocumentType;
  filePath: string;
  /** 1-based attempt number of this run. */
  attempt: number;
  /** True when this claim took over a running job whose lease had expired (a crashed worker). */
  reclaimed: boolean;
}

/** Fenced writes either apply or report that this worker no longer owns the job. */
export type FencedResult = 'applied' | 'lease_lost';
export type CompleteResult = 'done' | 'superseded' | 'lease_lost';

const seconds = (value: number) => sql`make_interval(secs => ${value}::double precision)`;
const millis = (value: number) => sql`make_interval(secs => ${value / 1000}::double precision)`;

function ownedBy(jobId: string, workerId: string) {
  return and(
    eq(extractionJobs.id, jobId),
    eq(extractionJobs.status, 'running'),
    eq(extractionJobs.lockedBy, workerId),
  );
}

/**
 * Claims the oldest eligible job: queued and due, or running with an expired lease. SKIP LOCKED
 * lets concurrent workers claim different jobs without blocking each other. The version is
 * marked `extracting` in the same transaction.
 */
export async function claimNextJob(
  db: Database,
  workerId: string,
  leaseSeconds: number,
): Promise<ClaimedJob | null> {
  return db.transaction(async (tx) => {
    const claimed = await tx.execute<{
      id: string;
      version_id: string;
      attempts: number;
      previous_status: string;
    }>(sql`
      with next_job as (
        select id, status as previous_status
        from extraction_jobs
        where (status = 'queued' and run_after <= now())
           or (status = 'running' and locked_until < now())
        order by created_at
        for update skip locked
        limit 1
      )
      update extraction_jobs j
      set status = 'running',
          locked_by = ${workerId},
          locked_until = now() + ${seconds(leaseSeconds)},
          heartbeat_at = now(),
          attempts = j.attempts + 1,
          started_at = now(),
          finished_at = null,
          updated_at = now()
      from next_job
      where j.id = next_job.id
      returning j.id, j.version_id, j.attempts, next_job.previous_status
    `);
    const job = claimed.rows[0];
    if (!job) {
      return null;
    }

    const versions = await tx.execute<{
      document_id: string;
      file_path: string;
      type: DocumentType;
    }>(
      sql`
        update document_versions v
        set status = 'extracting', updated_at = now()
        from documents d
        where v.id = ${job.version_id} and d.id = v.document_id
        returning v.document_id, v.file_path, d.type
      `,
    );
    const version = versions.rows[0];
    if (!version) {
      throw new Error(`Job ${job.id} points at missing version ${job.version_id}`);
    }

    return {
      jobId: job.id,
      versionId: job.version_id,
      documentId: version.document_id,
      documentType: version.type,
      filePath: version.file_path,
      attempt: Number(job.attempts),
      reclaimed: job.previous_status === 'running',
    };
  });
}

/** Extends the lease. Returns false when this worker no longer owns the job. */
export async function renewLease(
  db: Executor,
  jobId: string,
  workerId: string,
  leaseSeconds: number,
): Promise<boolean> {
  const renewed = await db
    .update(extractionJobs)
    .set({ lockedUntil: sql`now() + ${seconds(leaseSeconds)}`, heartbeatAt: sql`now()` })
    .where(ownedBy(jobId, workerId))
    .returning({ id: extractionJobs.id });
  return renewed.length > 0;
}

async function supersedeOwnedJob(
  tx: Executor,
  job: ClaimedJob,
  workerId: string,
): Promise<FencedResult> {
  const updated = await tx
    .update(extractionJobs)
    .set({ status: 'superseded', lockedUntil: null, finishedAt: sql`now()` })
    .where(ownedBy(job.jobId, workerId))
    .returning({ id: extractionJobs.id });
  if (updated.length === 0) {
    return 'lease_lost';
  }
  await tx
    .update(documentVersions)
    .set({ status: 'superseded' })
    .where(and(eq(documentVersions.id, job.versionId), eq(documentVersions.status, 'extracting')));
  return 'applied';
}

/**
 * Writes the result in one transaction: job done (with prompt and raw response), all values
 * (idempotent on (version_id, field)), version extracted. If a newer version exists, nothing is
 * written and the job is superseded instead. The document row is share-locked so a new version
 * cannot be created between the check and the write.
 */
export async function completeJob(
  db: Database,
  job: ClaimedJob,
  workerId: string,
  result: ExtractionResult,
): Promise<CompleteResult> {
  return db.transaction(async (tx) => {
    await lockDocument(tx, job.documentId, 'share');
    const latest = await findLatestVersion(tx, job.documentId);
    if (latest?.id !== job.versionId) {
      const superseded = await supersedeOwnedJob(tx, job, workerId);
      return superseded === 'applied' ? 'superseded' : 'lease_lost';
    }

    const fenced = await tx
      .update(extractionJobs)
      .set({
        status: 'done',
        prompt: result.prompt,
        rawResponse: result.rawResponse,
        lastError: null,
        lockedUntil: null,
        finishedAt: sql`now()`,
      })
      .where(ownedBy(job.jobId, workerId))
      .returning({ id: extractionJobs.id });
    if (fenced.length === 0) {
      return 'lease_lost';
    }

    if (result.fields.length > 0) {
      await tx
        .insert(extractedValues)
        .values(result.fields.map((field) => ({ versionId: job.versionId, ...field })))
        .onConflictDoNothing({ target: [extractedValues.versionId, extractedValues.field] });
    }
    await tx
      .update(documentVersions)
      .set({ status: 'extracted', parsedText: result.parsedText, error: null })
      .where(eq(documentVersions.id, job.versionId));
    return 'done';
  });
}

/** Hands the job back to the queue, claimable again after `delayMs` (backoff). */
export async function scheduleRetry(
  db: Database,
  job: ClaimedJob,
  workerId: string,
  input: { delayMs: number; error: string; versionError: string },
): Promise<FencedResult> {
  return db.transaction(async (tx) => {
    const fenced = await tx
      .update(extractionJobs)
      .set({
        status: 'queued',
        lockedBy: null,
        lockedUntil: null,
        runAfter: sql`now() + ${millis(input.delayMs)}`,
        lastError: input.error,
      })
      .where(ownedBy(job.jobId, workerId))
      .returning({ id: extractionJobs.id });
    if (fenced.length === 0) {
      return 'lease_lost';
    }
    await tx
      .update(documentVersions)
      .set({ status: 'queued', error: input.versionError })
      .where(eq(documentVersions.id, job.versionId));
    return 'applied';
  });
}

/** Ends the job and its version as failed (retryable later via POST /documents/:id/retry). */
export async function failJob(
  db: Database,
  job: ClaimedJob,
  workerId: string,
  input: { error: string; versionError: string },
): Promise<FencedResult> {
  return db.transaction(async (tx) => {
    const fenced = await tx
      .update(extractionJobs)
      .set({
        status: 'failed',
        lockedUntil: null,
        finishedAt: sql`now()`,
        lastError: input.error,
      })
      .where(ownedBy(job.jobId, workerId))
      .returning({ id: extractionJobs.id });
    if (fenced.length === 0) {
      return 'lease_lost';
    }
    await tx
      .update(documentVersions)
      .set({ status: 'failed', error: input.versionError })
      .where(eq(documentVersions.id, job.versionId));
    return 'applied';
  });
}

/**
 * Returns an in-flight job to the queue at shutdown. The attempt is not counted: the job did
 * not fail, the worker stopped.
 */
export async function releaseJob(
  db: Database,
  job: ClaimedJob,
  workerId: string,
): Promise<FencedResult> {
  return db.transaction(async (tx) => {
    const fenced = await tx
      .update(extractionJobs)
      .set({
        status: 'queued',
        lockedBy: null,
        lockedUntil: null,
        runAfter: sql`now()`,
        attempts: sql`greatest(${extractionJobs.attempts} - 1, 0)`,
      })
      .where(ownedBy(job.jobId, workerId))
      .returning({ id: extractionJobs.id });
    if (fenced.length === 0) {
      return 'lease_lost';
    }
    await tx
      .update(documentVersions)
      .set({ status: 'queued' })
      .where(eq(documentVersions.id, job.versionId));
    return 'applied';
  });
}

export async function findJobStatus(db: Executor, jobId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ status: extractionJobs.status })
    .from(extractionJobs)
    .where(eq(extractionJobs.id, jobId));
  return row?.status;
}

/** Running jobs whose lease has expired: work left behind by a crashed worker. */
export async function countExpiredLeases(db: Executor): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from extraction_jobs where status = 'running' and locked_until < now()`,
  );
  return Number(result.rows[0]?.n ?? 0);
}
