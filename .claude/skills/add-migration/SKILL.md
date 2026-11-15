---
name: add-migration
description: Use when changing the database schema, tables, constraints or seed data.
---

# Changing the schema

1. Postgres is the system of record. Never move durable state to memory, files or other stores.
2. Create a NEW migration file. Never edit a migration that has already been committed.
3. Enforce rules in the database: foreign keys, NOT NULL, unique constraints (e.g. one value per version_id + field, one open job per version).
4. Versions are append-only: never update or delete an older version's rows, values or reviews.
5. Keep the seed idempotent: re-running it must not create duplicates.
6. Run migrations against the Docker database (localhost:5433) and confirm they apply cleanly from an empty database (`docker compose down -v`, then up).
7. Add or update tests that rely on the new constraints.
8. Update the Schema section of README.md.
9. Finish with the pr-check skill.
