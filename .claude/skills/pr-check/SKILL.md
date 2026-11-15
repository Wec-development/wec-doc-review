---
name: pr-check
description: Use before finishing any feature step, to make sure the change is ready for a pull request that the client will review in full.
---

# PR readiness check

1. Run `pnpm format`, `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test`. Fix every failure.
2. Every new behaviour has a test in the same change.
3. No `any`, no `console.log` debugging, no commented-out code, no TODO without a reason.
4. Run `git status`: `.env`, secrets, `node_modules/`, `dist/` must not be staged.
5. Update the matching README section if behaviour or setup changed.
6. Draft a PR description with three parts: What, Why, How to test.
7. Suggest a conventional commit message (feat/fix/test/refactor/docs/chore, under 72 chars).
8. Do not commit or push. Never add Co-Authored-By or AI attribution.
