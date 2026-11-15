---
name: testing
description: Use when adding a feature, fixing a bug, or when asked to write or improve tests.
---

# Testing standards

1. Use Vitest. Tests sit next to the code as *.test.ts.
2. Test behaviour, not implementation details. One behaviour per test, clear names ("stores a gap when evidence is not in the text").
3. Mock the LLM in tests — never call a real provider. Use fixture text from fixtures/.
4. Integration tests run against real Postgres (Docker on localhost:5433), each test isolated (transaction rollback or truncate).
5. Priority tests (client tests these): evidence-not-found → gap; field missing → gap with reason; same version extracted twice → no duplicates; expired job lock reclaimed after crash; LLM error → failed and retryable; invoice v1→v2 → exactly 2 pending, 3 carried over; new version during extraction → older job superseded.
6. A bug fix starts with a failing test that reproduces it.
7. `pnpm test` must pass with no skipped or flaky tests.
