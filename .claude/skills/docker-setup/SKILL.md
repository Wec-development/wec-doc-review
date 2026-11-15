---
name: docker-setup
description: Use when changing docker-compose.yml, Dockerfiles, startup scripts, migrations-on-boot or seeding.
---

# Docker standards

1. `docker compose up` at the repo root must start everything, run migrations and seed v1 of the fixtures — the client runs only this.
2. Services depend on Postgres with `condition: service_healthy`.
3. Dockerfiles install with pnpm and the lockfile (`--frozen-lockfile`); build packages/shared before apps.
4. Use small base images (node alpine/slim), non-root user, and a .dockerignore (node_modules, dist, .env, .git).
5. Secrets come from environment variables, never baked into images.
6. Seed must be idempotent so restarts never duplicate data.
7. Verify from scratch: `docker compose down -v && docker compose up`, then the restart test.
