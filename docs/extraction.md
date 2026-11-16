# Extraction in detail

The README gives the summary; this page covers the rules a reviewer of the code will want to check. Code: [`apps/api/src/extraction/`](../apps/api/src/extraction/). Each step is a small pure module with its own tests.

```
stored PDF ──pdfjs-dist──▶ raw text ──▶ prompt (field definitions + <document>) ──▶ one model call
   │                         │                                                     (structured JSON output)
   │                         └─ stored as document_versions.parsed_text                    │
   │                                                                                         ▼
   │                    values + gaps ◀── normalise ◀── value supported? ◀── evidence in THIS text? ◀── Zod-parse
```

## Parsing

[pdfjs-dist](https://github.com/mozilla/pdf.js) (Mozilla's PDF.js, no runtime dependencies) turns the PDF into text, keeping a line break wherever PDF.js reports one. That raw text is stored on `document_versions.parsed_text` and never normalised, so evidence offsets point into exactly what the reviewer sees. Permanent failures:

- encrypted or unreadable PDFs;
- PDFs with no extractable text: "No extractable text — scanned PDFs are not supported" (there is no OCR);
- documents longer than `MAX_DOCUMENT_CHARS` (default 100,000).

## The model call

- **Prompt.** `PROMPT_VERSION = extract-v1`, stored on the job. It lists each field's name, type and a one-line description from `packages/shared`, then the document between `<document>` tags.
- **Structured output.**
  - Anthropic: `output_config.format` with a JSON schema.
  - OpenAI: `response_format` with a `strict` JSON schema.
  - Either way the reply must be `{ fields: [{ field, value, evidence, not_found_reason }] }`, with `field` an enum of the type's fields.
- **Instructions to the model:**
  - copy evidence character for character, never paraphrase or join separate lines;
  - return null with a reason rather than guess;
  - pick the value that matches the field's meaning (total due, not subtotal).
- **Settings on the call:**
  - one request per attempt, with SDK retries off, because the job queue owns retries;
  - an `LLM_TIMEOUT_MS` timeout;
  - server-side refusal fallbacks on Anthropic models that support them.
- **Providers.** Both clients ([`anthropic-client.ts`](../apps/api/src/extraction/llm/anthropic-client.ts), [`openai-client.ts`](../apps/api/src/extraction/llm/openai-client.ts)) implement one `LlmClient` interface, with the same error mapping. Everything after the call doesn't depend on the provider.

**Prompt-injection defence.** The document is wrapped in `<document>` tags, and the system prompt says it is untrusted data. More importantly, nothing the model says is trusted: every value goes through the checks below, so injected text can at most produce gaps.

## What code enforces

[`verify-fields.ts`](../apps/api/src/extraction/validate/verify-fields.ts), field by field:

| Check                                                                             | Fails as                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Output doesn't match the schema                                                   | the whole attempt is retryable (raw response kept)                        |
| Field missing from the output (unknown fields ignored; duplicates keep the first) | gap: `Not returned by the model`                                          |
| Model says not found                                                              | gap with the model's reason, or `Not found in document`                   |
| Evidence empty                                                                    | gap: `No evidence quoted for the value`                                   |
| Evidence not found verbatim in **this version's** text                            | gap: `Quoted evidence not found in document text`; the value is discarded |
| Value not stated by its evidence                                                  | gap: `Value not supported by its evidence`                                |
| Value can't be normalised as its type                                             | gap: `Value could not be normalised as <type>`                            |

**Verbatim matching.**

- **What is normalised, identically on both sides:** Unicode NFKC (which folds PDF ligatures such as `ﬁ`); every whitespace run (spaces, tabs, `\r\n`, `\r`, `\n`) becomes one space; then trim.
- **What is deliberately not normalised:** letter case, punctuation, symbols and digits. A paraphrase, a re-cased line or a "fixed" number never matches.
- **What gets stored:** the match is mapped back to raw positions, so `evidence` is the exact passage from the document and `evidence_start`/`evidence_end` locate it.

**Value–evidence consistency.** A real line can still be the wrong line, for example the subtotal quoted for the total. The value must be stated by its evidence:

- any type: the value appears in the evidence (case-insensitive);
- money, numbers and percentages: its number is among the evidence's numbers, so `5,230.30` fails against `Total Due: $5,230.29`;
- dates: the evidence contains the same calendar date, in any common format.

## Normalisation

The value is stored as written (`value`) and in canonical form (`normalized_value`). Carry-over compares the canonical form.

| Type    | Canonical form                                                                           |
| ------- | ---------------------------------------------------------------------------------------- |
| date    | `YYYY-MM-DD` (`March 1, 2025` → `2025-03-01`; slash dates are read as US month/day/year) |
| money   | decimal plus currency code (`$5,230.29` → `5230.29 USD`; `$` is read as USD)             |
| percent | decimal (`4.2%` → `4.2`)                                                                 |
| number  | decimal (`twenty-four (24)` → `24`)                                                      |
| string  | whitespace collapsed                                                                     |

Anything ambiguous becomes a gap rather than a guess: two different numbers, an impossible date, or a European `1.200,50`.

## Errors and retries

- **Retryable:** timeouts, 429, 5xx, network errors, malformed or truncated output.
- **Permanent:**
  - unreadable, empty or oversized PDFs;
  - 4xx responses, such as `LLM authentication failed — update the API key in Settings`;
  - model refusals.

Every attempt that reaches the model stores `prompt`, `prompt_version`, `provider`, `model`, `raw_response`, `usage` (input and output tokens) and `llm_duration_ms` on the job, on success and on failure. The worker logs one JSON line per job, with token counts and the numbers of values and gaps, never document text.

**Cost.** One call per attempt. The fixtures are one page each: about 1,000 input tokens plus 500–700 output tokens, so extracting all three seeded documents costs a few cents.

## Recorded replies and live runs

Tests never call a model:

- Golden tests run the real parser and the real SDK client against model replies recorded in [`apps/api/test/recordings/`](../apps/api/test/recordings/), replayed through an injected `fetch`.
- Variants are built from those recordings in code with `buildRecording`, not hand-copied JSON: a fabricated quote, a refusal, and a v2 reply that quotes v1.
- The OpenAI tests use `chat.completion` bodies built from the same recorded fields.

To call the real provider once (this costs a few cents and never runs in CI):

```sh
export LLM_LIVE_TEST_PROVIDER=anthropic LLM_LIVE_TEST_MODEL=claude-haiku-5-5
read -rs LLM_LIVE_TEST_KEY && export LLM_LIVE_TEST_KEY    # paste the key; it is not echoed
pnpm --filter @doc-review/api test:live                   # invoice-001.pdf
LLM_RECORD=1 pnpm --filter @doc-review/api test:live      # also refreshes the recordings
pnpm --filter @doc-review/api llm:models                  # list the models this key can use (free)
```

These test-only variables are separate from the app, which only ever uses the key saved, encrypted, in Settings.

## Re-extraction: field-by-field comparison

The README explains the rule. The pure function is [`compareVersions`](../apps/api/src/extraction/carry-over/compare-versions.ts). Every value with a baseline records a `comparison` (`initial`, `unchanged`, `changed`, `added`) and the reason:

| `comparison_reason`          | Result    | Meaning                                                               |
| ---------------------------- | --------- | --------------------------------------------------------------------- |
| `evidence_matches`           | unchanged | same normalised value; each quote found verbatim in the other version |
| `still_not_found`            | unchanged | a `not_found` gap in both versions                                    |
| `value_differs`              | changed   | normalised values differ                                              |
| `baseline_evidence_missing`  | changed   | the previous version's quote is not in the new text                   |
| `candidate_evidence_missing` | changed   | the new quote is not in the previous version's text                   |
| `became_gap`                 | changed   | a value became a gap                                                  |
| `gap_resolved`               | changed   | a gap now has a value                                                 |
| `gap_kind_changed`           | changed   | a gap in both versions, but not `not_found` in both                   |
| `no_baseline_value`          | added     | the field has no counterpart in the baseline                          |

Gap kinds: `not_found`, `evidence_not_verified`, `not_supported`, `not_normalisable`, `not_returned`. Only `not_found` on both sides counts as unchanged; any other gap is re-reviewed.
