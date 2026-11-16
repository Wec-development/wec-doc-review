CREATE TYPE "public"."comparison" AS ENUM('initial', 'unchanged', 'changed', 'added');--> statement-breakpoint
CREATE TYPE "public"."gap_kind" AS ENUM('not_found', 'evidence_not_verified', 'not_supported', 'not_normalisable', 'not_returned');--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "baseline_version_id" uuid;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD COLUMN "gap_kind" "gap_kind";--> statement-breakpoint
ALTER TABLE "extracted_values" ADD COLUMN "comparison" "comparison" DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD COLUMN "comparison_reason" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "carried_from_review_id" uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_baseline_version_id_document_versions_id_fk" FOREIGN KEY ("baseline_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_carried_from_review_id_reviews_id_fk" FOREIGN KEY ("carried_from_review_id") REFERENCES "public"."reviews"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_carried_once_uq" ON "reviews" USING btree ("value_id","carried_from_review_id") WHERE "reviews"."carried_from_review_id" is not null;--> statement-breakpoint
-- Backfill (hand-written): existing values were never compared, so they keep the default
-- comparison 'initial'. Existing gaps get a kind derived from the reason Step 6 stored; any other
-- reason came from the model saying the field is absent.
UPDATE "extracted_values" SET "gap_kind" = CASE
	WHEN "gap_reason" = 'Not returned by the model' THEN 'not_returned'::"gap_kind"
	WHEN "gap_reason" IN ('Quoted evidence not found in document text', 'No evidence quoted for the value') THEN 'evidence_not_verified'::"gap_kind"
	WHEN "gap_reason" = 'Value not supported by its evidence' THEN 'not_supported'::"gap_kind"
	WHEN "gap_reason" LIKE 'Value could not be normalised as %' THEN 'not_normalisable'::"gap_kind"
	ELSE 'not_found'::"gap_kind"
END
WHERE "value" IS NULL;--> statement-breakpoint
ALTER TABLE "extracted_values" ADD CONSTRAINT "extracted_values_gap_kind" CHECK (("extracted_values"."value" is null) = ("extracted_values"."gap_kind" is not null));--> statement-breakpoint
-- Review state now follows the latest review (hand-written; the view is not managed by
-- drizzle-kit). A value is carried_over when its latest review was carried from the previous
-- version; a reviewer's later approve/correct supersedes that (reviews stay append-only).
DROP VIEW "value_review_states";--> statement-breakpoint
CREATE VIEW "value_review_states" AS
SELECT
	v."id" AS "value_id",
	v."version_id",
	(v."value" IS NULL) AS "is_gap",
	CASE
		WHEN latest."id" IS NULL THEN 'pending'
		WHEN latest."carried_from_review_id" IS NOT NULL THEN 'carried_over'
		WHEN latest."action" = 'approve' THEN 'approved'
		ELSE 'corrected'
	END AS "review_state",
	latest."action" AS "review_action",
	latest."corrected_value",
	latest."note",
	latest."reviewer",
	latest."created_at" AS "reviewed_at",
	latest."id" AS "review_id",
	latest."carried_from_review_id",
	CASE
		WHEN latest."carried_from_review_id" IS NULL THEN NULL
		WHEN latest."action" = 'approve' THEN 'approved'
		ELSE 'corrected'
	END AS "carried_action"
FROM "extracted_values" v
LEFT JOIN LATERAL (
	SELECT r."id", r."action", r."corrected_value", r."note", r."reviewer", r."created_at", r."carried_from_review_id"
	FROM "reviews" r
	WHERE r."value_id" = v."id"
	ORDER BY r."created_at" DESC, r."id" DESC
	LIMIT 1
) latest ON true;
