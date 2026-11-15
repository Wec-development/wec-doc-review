ALTER TYPE "public"."version_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "file_sha256" text;