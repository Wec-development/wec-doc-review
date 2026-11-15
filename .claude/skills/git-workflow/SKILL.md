---
name: git-workflow
description: Use when starting a new feature, preparing commits, or writing a pull request description.
---

# Git workflow (client reviews history)

1. One branch per feature from up-to-date main: feat/<name>, fix/<name>, docs/<name>, chore/<name>.
2. Small commits that each build and pass tests. Code and its tests in the same commit.
3. Conventional messages, present tense, under 72 chars: feat:, fix:, test:, refactor:, docs:, chore:.
4. Never commit .env, secrets, node_modules, dist, logs or .DS_Store.
5. PR description: What / Why (design decision) / How to test. One feature per PR; no unrelated formatting changes.
6. Do not commit or push yourself — propose the message and let me run git.
7. Never add Co-Authored-By, "Generated with", or any AI tool mention in commits, PRs, branches or tags.
