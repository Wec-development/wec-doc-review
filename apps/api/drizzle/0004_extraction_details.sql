ALTER TABLE "extracted_values" ADD COLUMN "normalized_value" text;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD COLUMN "evidence_start" integer;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD COLUMN "evidence_end" integer;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "llm_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD CONSTRAINT "extracted_values_evidence_offsets" CHECK (("extracted_values"."evidence_start" is null and "extracted_values"."evidence_end" is null) or ("extracted_values"."evidence_start" >= 0 and "extracted_values"."evidence_end" > "extracted_values"."evidence_start"));