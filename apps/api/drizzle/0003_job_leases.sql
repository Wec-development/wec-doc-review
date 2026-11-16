DROP INDEX "extraction_jobs_claim_idx";--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "run_after" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "extraction_jobs_claim_queued_idx" ON "extraction_jobs" USING btree ("run_after","created_at") WHERE "extraction_jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "extraction_jobs_claim_expired_idx" ON "extraction_jobs" USING btree ("locked_until") WHERE "extraction_jobs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_running_has_lease" CHECK ("extraction_jobs"."status" <> 'running' or ("extraction_jobs"."locked_by" is not null and "extraction_jobs"."locked_until" is not null));