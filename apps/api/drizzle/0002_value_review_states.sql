-- The single definition of a value's review state, reused by the document list, the document
-- detail view and progress counts. The latest review wins (reviews are append-only).
--   carried_over: carried over from the previous version (its review was copied with it)
--   approved / corrected: decided by the latest review's action
--   pending: no review yet
CREATE VIEW "value_review_states" AS
SELECT
	v."id" AS "value_id",
	v."version_id",
	(v."value" IS NULL) AS "is_gap",
	CASE
		WHEN v."carried_over" THEN 'carried_over'
		WHEN latest."action" = 'approve' THEN 'approved'
		WHEN latest."action" = 'correct' THEN 'corrected'
		ELSE 'pending'
	END AS "review_state",
	latest."action" AS "review_action",
	latest."corrected_value",
	latest."note",
	latest."reviewer",
	latest."created_at" AS "reviewed_at"
FROM "extracted_values" v
LEFT JOIN LATERAL (
	SELECT r."action", r."corrected_value", r."note", r."reviewer", r."created_at"
	FROM "reviews" r
	WHERE r."value_id" = v."id"
	ORDER BY r."created_at" DESC, r."id" DESC
	LIMIT 1
) latest ON true;
