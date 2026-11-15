---
name: code-standards
description: Use whenever writing or changing TypeScript code anywhere in this monorepo.
---

# Code standards

1. Strict TypeScript: no `any`, no non-null `!` unless proven safe, no `@ts-ignore`.
2. Small, single-purpose functions; descriptive names (no `data`, `tmp`, `res2`).
3. Shared types, field definitions and Zod schemas live in packages/shared — never duplicate them in apps.
4. Validate every external input (HTTP, env, LLM output, files) with Zod at the boundary.
5. Handle errors explicitly; never swallow them. Log with context, return a clear state.
6. Comments explain why, never what. No commented-out code.
7. Use `import type` for types. Keep imports ordered and unused code removed.
8. Config comes from validated env (apps/api/src/config.ts); never hard-code secrets, URLs or ports.
9. Prefer pure functions for logic (evidence matching, carry-over) so they are easy to unit test.
