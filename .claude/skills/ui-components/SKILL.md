---
name: ui-components
description: Use when creating or changing React components, pages or routes in apps/web.
---

# Component structure

1. Folders: src/pages (DocumentsPage, DocumentDetailPage), src/components (StatusBadge, ValueCard, GapCard, EvidenceQuote, CorrectionForm, DocumentText, ProgressBar), src/api, src/styles.
2. Function components with typed props; one component per file; keep each under ~150 lines.
3. No business logic in JSX: derive sorted/grouped values (pending → gaps → carried over) in small pure helpers with unit tests.
4. Forms use controlled inputs with a <label>; corrected value is required, note optional; validate with the shared Zod schema.
5. Show the previous version's value and review beside any changed value after re-extraction.
6. Test components with Vitest + Testing Library: renders states, approve/correct actions, gap visibility. Mock the API client, not fetch internals.
7. Reuse existing components before creating new ones.
