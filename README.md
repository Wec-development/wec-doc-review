# Document Review

PDF documents go in, an LLM extracts structured values with verbatim evidence, and a reviewer approves or corrects every value before it is trusted, including when a revised version of a document arrives.

> Status: project skeleton. Sections marked _TODO_ are filled in as the features land.

## Quick start

Requirements: Node 22 (`nvm use`), pnpm 10 (`corepack enable`), Docker Desktop.

```sh
cp .env.example .env        # add your LLM_API_KEY
pnpm install
pnpm db:up                  # Postgres in Docker
pnpm dev                    # API on :3000, web on :5173
```

Check the API: <http://localhost:3000/health>

_TODO: once the api and web services are in `docker-compose.yml`, `docker compose up` alone starts everything, runs migrations and seeds version 1 of the fixtures._

## Scripts

| Command               | What it does                               |
| --------------------- | ------------------------------------------ |
| `pnpm dev`            | Build shared types, run API and web in dev |
| `pnpm build`          | Build every package                        |
| `pnpm typecheck`      | Type-check every package                   |
| `pnpm lint`           | ESLint across the repo                     |
| `pnpm format`         | Format with Prettier                       |
| `pnpm test`           | Run all tests                              |
| `pnpm db:up` / `down` | Start / stop Postgres                      |

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

_TODO: documents, versions, extraction jobs, values, reviews — and how they relate._

## How extraction is coordinated

_TODO: Postgres-backed job table, locking, retries, crash recovery, idempotency._

## Decisions

_TODO: correction model, what "unchanged evidence" means, new version during extraction, polling vs streaming._

## What I cut and what's next

_TODO_

## At 10,000 documents

_TODO_
