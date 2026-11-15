---
name: react-data-fetching
description: Use when apps/web calls the API, loads data, polls status, or submits reviews and uploads.
---

# Data fetching

1. Use TanStack Query for all server state; no fetching inside useEffect.
2. One API client module (apps/web/src/api/client.ts) wraps fetch, sets the base URL from VITE_API_URL, and parses responses with the Zod schemas from packages/shared.
3. Query keys: ['documents'], ['document', id, version?], ['progress', id].
4. Polling: refetchInterval 3000 ms ONLY while any document is queued or extracting; return false once all are settled.
5. Mutations (upload, new version, review, retry) invalidate the affected document and list queries on success.
6. Every request shows loading, empty and error states; errors show a readable message and a retry action.
7. Disable submit buttons while a mutation is pending to prevent double submits.
8. Never put API keys or secrets in the web app.
