---
name: job-queue
description: Use when working on the background worker, extraction_jobs table, retries, locking, crash recovery or concurrency between versions.
---

# Postgres job queue rules

1. The queue is the extraction_jobs table in Postgres. No Redis or queue libraries.
2. Claim with `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` inside a transaction; set status running, locked_until = now() + interval, attempts + 1.
3. Crash recovery: a running job whose locked_until has passed is claimable again. Nothing may stay `extracting` forever.
4. Retries: on error save the message; re-queue while attempts < max (3); then mark job and version failed (visible, retryable via API).
5. Idempotency: write all values for a version in one transaction with a unique (version_id, field) constraint.
6. Supersede: before writing results, check the version is still the latest; if not, mark the job superseded and keep the old version queryable.
7. Uploads only insert rows and return immediately — the worker does the LLM call.
8. Test it with `docker compose restart` mid-extraction.
