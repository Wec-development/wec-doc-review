# API reference

The API is Fastify on port `3000` (in Docker the web UI reaches it as `/api` through nginx). Request and response shapes are Zod schemas in [`packages/shared/src/api.ts`](../packages/shared/src/api.ts) and [`settings.ts`](../packages/shared/src/settings.ts), shared with the web app. JSON is camelCase and timestamps are ISO 8601.

## Routes

| Method & path                           | Body                                                             | Success                                                                       | Errors                  |
| --------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| `POST /documents`                       | multipart: `type`, `file` (PDF), optional `title`                | `202` `{ documentId, versionId, versionNo, status }`                          | 400, 413, 415           |
| `POST /documents/:id/versions`          | multipart: `file` (PDF)                                          | `202` same shape                                                              | 400, 404, 409, 413, 415 |
| `GET /documents`                        | —                                                                | `200` `{ documents: [...] }` with status, progress and the failure reason     | —                       |
| `GET /documents/:id?version=N`          | —                                                                | `200` document, selected version (with `parsedText`), all versions and values | 400, 404                |
| `GET /documents/:id/progress?version=N` | —                                                                | `200` `{ pending, approved, corrected, carriedOver, gaps, total }`            | 400, 404                |
| `GET /documents/:id/file?version=N`     | —                                                                | `200` the stored PDF, inline (`application/pdf`, `nosniff`)                   | 400, 404                |
| `POST /values/:id/review`               | `{ action: "approve" }` or `{ action: "correct", value, note? }` | `201` the value, as in `GET /documents/:id`                                   | 400, 404, 409           |
| `POST /documents/:id/retry`             | —                                                                | `202` `{ versionId, status: "queued" }`                                       | 404, 409                |
| `GET /settings/llm`                     | —                                                                | `200` `{ configured, provider, model, keyHint, lastVerifiedAt, updatedAt }`   | —                       |
| `POST /settings/llm/test`               | `{ provider, apiKey? }` (no key = test the stored one)           | `200` `{ valid: true, models: [{ id, label, recommended }] }`                 | 400, 401, 429, 502      |
| `PUT /settings/llm`                     | `{ provider, model, apiKey? }`                                   | `200` the `GET /settings/llm` shape                                           | 400, 401, 502           |
| `GET /health`                           | —                                                                | `200` `{ status: "ok", database: "up" }`                                      | 503                     |

Without `?version=N`, the current version (the highest `version_no`) is used.

## Examples

```sh
# Upload a new document (type: invoice | lease | market_report)
curl -s -F type=invoice -F 'file=@fixtures/documents/invoice-001.pdf;type=application/pdf' \
  http://localhost:3000/documents
# → 202 {"documentId":"…","versionId":"…","versionNo":1,"status":"queued"}

# Upload a revised PDF as the next version of that document
curl -s -F 'file=@fixtures/documents/invoice-001.v2.pdf;type=application/pdf' \
  http://localhost:3000/documents/$DOCUMENT_ID/versions
# → 202 {"documentId":"…","versionId":"…","versionNo":2,"status":"queued"}

curl -s "http://localhost:3000/documents/$DOCUMENT_ID?version=1"       # an older version, read-only
curl -s "http://localhost:3000/documents/$DOCUMENT_ID/progress"
curl -s -H 'content-type: application/json' -d '{"action":"correct","value":"2025-12-15","note":"Revised"}' \
  http://localhost:3000/values/$VALUE_ID/review                        # → 201 the updated value
```

## Errors

Every non-2xx response uses one envelope: `{ "error": { "code", "message", "details"? } }`.

| Code                     | Status | When                                                                                        |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400    | Invalid params, query or body; `details` lists each failing field                           |
| `BAD_REQUEST`            | 400    | Malformed JSON                                                                              |
| `INVALID_API_KEY`        | 401    | The provider rejected the key                                                               |
| `NOT_FOUND`              | 404    | Unknown document, version or value                                                          |
| `CONFLICT`               | 409    | Review on an older or not-yet-extracted version; identical re-upload; retry when not failed |
| `PAYLOAD_TOO_LARGE`      | 413    | Upload over `MAX_UPLOAD_MB`                                                                 |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | Not declared as `application/pdf`, or doesn't start with `%PDF-`                            |
| `RATE_LIMITED`           | 429    | More than 10 connection tests a minute from one client                                      |
| `PROVIDER_UNAVAILABLE`   | 502    | The LLM provider timed out or failed: "Provider unreachable — try again"                    |
| `INTERNAL_ERROR`         | 500    | Anything unexpected; never includes the message, stack or SQL                               |

## Behaviour worth knowing

**Uploads return `202 Accepted`.** An upload validates the file, stores it and inserts the version plus a `queued` job in one transaction. It never parses the PDF or calls the LLM. If the transaction fails, the stored file is removed.

**Upload validation.** The file must be declared as `application/pdf` and start with `%PDF-` (otherwise 415), and be at most `MAX_UPLOAD_MB` (default 10; otherwise 413). Files are stored at `STORAGE_DIR/<documentId>/v<versionNo>-<sha256>.pdf`, and the SHA-256 is recorded on the version. Re-uploading a file identical to the current version returns 409 and creates nothing.

**Reviews.** A review is appended, never edited; the latest review wins. `correct` stores the reviewer's value beside the extracted one, which is never overwritten. Only the current version, once `extracted`, can be reviewed; older versions are read-only (409). Gaps can be reviewed too: `approve` confirms the field really is missing, and `correct` supplies the value.

**A new version while the previous one is still extracting.** `POST /documents/:id/versions` locks the document row (`SELECT … FOR UPDATE`), so concurrent uploads get consecutive version numbers. In the same transaction it marks every open job of older versions `superseded` (and those versions `superseded`), then inserts version N+1 with a fresh `queued` job. Reviews take a shared lock on the same row, so a review can't land on a version that is being replaced.

**Retry.** `POST /documents/:id/retry` only works when the current version is `failed`. It sets the version back to `queued` and adds a new job. A partial unique index guarantees at most one open job per version.

**LLM settings.** `GET` never returns the key, only its last 4 characters (`keyHint`). `POST /test` calls the provider's free list-models endpoint and returns the models usable for extraction, with one marked recommended. `PUT` re-runs that check server-side, rejects a model outside the key's list (400), then encrypts and saves. The key may be omitted on `PUT` only when one is stored and the provider is unchanged.
