CREATE TYPE "public"."document_type" AS ENUM('invoice', 'lease', 'market_report');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."review_action" AS ENUM('approve', 'correct');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('queued', 'extracting', 'extracted', 'failed');--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"file_path" text NOT NULL,
	"parsed_text" text,
	"status" "version_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_document_version_uq" UNIQUE("document_id","version_no"),
	CONSTRAINT "document_versions_version_no_positive" CHECK ("document_versions"."version_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"fixture_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_fixture_key_uq" UNIQUE("fixture_key")
);
--> statement-breakpoint
CREATE TABLE "extracted_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text,
	"evidence" text,
	"gap_reason" text,
	"previous_value_id" uuid,
	"carried_over" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extracted_values_version_field_uq" UNIQUE("version_id","field"),
	CONSTRAINT "extracted_values_value_or_gap" CHECK (("extracted_values"."value" is not null and "extracted_values"."evidence" is not null) or ("extracted_values"."value" is null and "extracted_values"."gap_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"prompt" text,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value_id" uuid NOT NULL,
	"action" "review_action" NOT NULL,
	"corrected_value" text,
	"note" text,
	"reviewer" text DEFAULT 'reviewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_correct_needs_value" CHECK ("reviews"."action" <> 'correct' or "reviews"."corrected_value" is not null)
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD CONSTRAINT "extracted_values_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD CONSTRAINT "extracted_values_previous_value_id_extracted_values_id_fk" FOREIGN KEY ("previous_value_id") REFERENCES "public"."extracted_values"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_value_id_extracted_values_id_fk" FOREIGN KEY ("value_id") REFERENCES "public"."extracted_values"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_jobs_one_open_per_version" ON "extraction_jobs" USING btree ("version_id") WHERE "extraction_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "extraction_jobs_claim_idx" ON "extraction_jobs" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX "reviews_value_created_idx" ON "reviews" USING btree ("value_id","created_at");