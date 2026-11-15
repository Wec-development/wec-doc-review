---
name: extraction-rules
description: Use whenever working on PDF parsing, the LLM prompt, evidence validation, gaps, re-extraction or review carry-over.
---

# Extraction rules (tested by the client — never weaken)

1. Extraction is LLM-based and runs in the background worker, never inside an HTTP request.
2. Each value carries evidence: an exact passage from that version's parsed text.
3. Validate evidence verbatim against the parsed text of the SAME version (normalise whitespace and line endings only). If it is not found, store a gap: value null with a reason. Never keep the value.
4. A field the LLM cannot find is a gap with a reason, never a guess.
5. Store the prompt and raw LLM response for every extraction job.
6. Re-extracting the same version must never duplicate values (unique version_id + field; idempotent writes).
7. An LLM or parse error sets the version to failed and leaves it retryable.
8. Re-extraction: same field with unchanged normalised evidence and value keeps its review and is marked carried_over; changed evidence goes back to pending with a link to the previous value and review.
9. Older versions, values and reviews are never deleted.
10. Fixture check: the revised invoice must leave exactly 2 values pending (due_date, total_amount); median_household_income in the market report must be a gap.
11. Finish with the pr-check skill.
