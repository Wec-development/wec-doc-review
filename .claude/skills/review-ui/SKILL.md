---
name: review-ui
description: Use when building or changing anything in apps/web.
---

# Review UI standards

1. Goal: a reviewer sees what needs attention within 5 seconds. Order: pending → gaps → carried over.
2. Every value shows its source quote beside it. Gaps always visible with their reason — never hidden.
3. Changed values after re-extraction show the previous version's value and review.
4. Carried-over values are visually distinct from newly pending ones (label, not colour alone).
5. Poll only while a document is queued or extracting; stop when settled.
6. Accessible: real <button>, <label> for inputs, keyboard usable, sufficient contrast.
7. Types and request schemas come from packages/shared; API calls go through one small client module.
8. Show loading, empty and error states for every request.
9. Keep components small; no inline business logic in JSX.
