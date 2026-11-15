---
name: add-endpoint
description: Use when adding or changing an HTTP route in apps/api.
---

# Adding an API endpoint

1. Define the request/response shapes as Zod schemas in packages/shared when the web app also uses them; otherwise next to the route.
2. Register the route in apps/api via buildApp so it is testable with `app.inject()`.
3. Validate params, query and body with Zod; return 400 with a clear message on invalid input.
4. Return explicit status codes: 201/202 for creates, 404 for missing resources, 409 for conflicts.
5. Never call the LLM inside a request handler. Long work goes into the extraction_jobs table.
6. Wrap multi-row writes in a single transaction.
7. Add tests for the happy path, invalid input and not-found.
8. Finish with the pr-check skill.
