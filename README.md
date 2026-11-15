# Document Review

PDF documents go in, an LLM extracts structured values with verbatim evidence, and a reviewer approves or corrects every value before it is trusted, including when a revised version of a document arrives.

> Status: project skeleton. Sections marked _TODO_ are filled in as the features land.

## Quick start

Requirements: Node 22 (`nvm use`), pnpm 10 (`corepack enable`), Docker Desktop.

```sh
cp .env.example .env        # add your LLM_API_KEY
pnpm install
pnpm db:up                  # Postgres in Docker (host port 5433)
pnpm db:migrate             # create the schema
pnpm db:seed                # insert version 1 of the 3 fixture documents (safe to re-run)
pnpm dev                    # API on :3000, web on :5173
```

Check the API: <http://localhost:3000/health>

_TODO: once the api and web services are in `docker-compose.yml`, `docker compose up` alone starts everything, runs migrations and seeds version 1 of the fixtures._

## Scripts

| Command                                     | What it does                                                       |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                                  | Build shared types, run API and web in dev                         |
| `pnpm build`                                | Build every package                                                |
| `pnpm typecheck`                            | Type-check every package                                           |
| `pnpm lint`                                 | ESLint across the repo                                             |
| `pnpm format`                               | Format with Prettier                                               |
| `pnpm test`                                 | Run all tests (API tests need Postgres up and migrated)            |
| `pnpm db:up` / `down`                       | Start / stop Postgres                                              |
| `pnpm db:migrate`                           | Apply SQL migrations from `apps/api/drizzle/`                      |
| `pnpm db:seed`                              | Seed version 1 of each fixture document plus a queued job          |
| `pnpm --filter @doc-review/api db:generate` | Generate a new migration after editing `apps/api/src/db/schema.ts` |

## Repository layout

```
apps/
  api/        Fastify API + extraction worker (Node, TypeScript)
  web/        React review UI (Vite)
packages/
  shared/     Field definitions, types and Zod schemas used by both apps
fixtures/     Sample PDFs and manifests provided with the assignment
```

Why this split: the API and the UI deploy separately, but must agree on field definitions, statuses and request shapes. Keeping those in `packages/shared` gives one source of truth and compile-time errors when they drift.

## Schema

Postgres is the system of record. Tables are defined in [`apps/api/src/db/schema.ts`](apps/api/src/db/schema.ts) (Drizzle), and the SQL migrations generated from it live in [`apps/api/drizzle/`](apps/api/drizzle/). Status and action enums are built from the lists in `packages/shared`, so the database, the API and the UI share one definition.

```
documents 1─* document_versions 1─* extraction_jobs
                       │
                       1─* extracted_values 1─* reviews
                              └─ previous_value_id → the same field's value on the previous version
```

| Table               | One row is…                    | Key columns                                                                     |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `documents`         | a logical document             | `type`, `title`, `fixture_key` (set only for seeded fixtures)                   |
| `document_versions` | one uploaded PDF               | `version_no`, `file_path`, `parsed_text`, `status`, `error`                     |
| `extraction_jobs`   | one extraction attempt (queue) | `status`, `attempts`, `locked_until`, `last_error`, `prompt`, `raw_response`    |
| `extracted_values`  | one field of one version       | `field`, `value`, `evidence`, `gap_reason`, `previous_value_id`, `carried_over` |
| `reviews`           | one approve/correct action     | `action`, `corrected_value`, `note`, `reviewer`                                 |

**Versions → values → reviews.** Every upload is a new version row, and values and reviews hang off that specific version. Nothing is updated in place or deleted: every foreign key is `ON DELETE RESTRICT`. Each version keeps its own `parsed_text`, so evidence for version N is always checked against version N's text, even after N+1 exists.

**Corrections live beside the value.** A review never overwrites `extracted_values.value`. A correction is a `reviews` row with `corrected_value` (plus an optional `note`), and the latest review for a value is its current state. This keeps what the LLM said, what the reviewer decided and the full history, which is also what re-extraction compares against.

**The current version is derived.** A document's current version is its highest `version_no`. There's no `documents.current_version_id`, because that would be a circular foreign key that has to be updated in step with every insert and could point at the wrong row.

**What the database guarantees:**

| Rule                                  | Constraint                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| No duplicate values for a version     | `UNIQUE (version_id, field)` on `extracted_values`, so re-extracting the same version can't add rows |
| At most one open job per version      | partial unique index on `extraction_jobs (version_id) WHERE status IN ('queued','running')`          |
| No duplicate version numbers          | `UNIQUE (document_id, version_no)` on `document_versions`                                            |
| A value carries evidence, or is a gap | `CHECK` on `extracted_values`: value and evidence both set, or value null with a `gap_reason`        |
| A correction has a value              | `CHECK` on `reviews`: `action = 'correct'` requires `corrected_value`                                |
| Seeding is idempotent                 | `UNIQUE (fixture_key)` on `documents`, and the seed uses `ON CONFLICT DO NOTHING` in one transaction |

The worker claims jobs through the `(status, locked_until)` index, and `reviews (value_id, created_at)` serves "latest review per value".

## How extraction is coordinated

_TODO: Postgres-backed job table, locking, retries, crash recovery, idempotency._

## Decisions

_TODO: correction model, what "unchanged evidence" means, new version during extraction, polling vs streaming._

## What I cut and what's next

_TODO_

## At 10,000 documents

_TODO_
