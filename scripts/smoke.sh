#!/usr/bin/env bash
# Builds and starts the whole stack from scratch, as a reviewer would, and checks it end to end.
#
#   scripts/smoke.sh                  # first-run state: 3 seeded documents, queued (no LLM yet)
#   scripts/smoke.sh --with-fake-llm  # test-only: the fake extractor must extract all 3
#   options: --no-build (reuse built images, e.g. in CI), --keep (leave the stack running)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/docker-lib.sh"

WITH_FAKE_LLM=false
BUILD=--build
KEEP=false
for arg in "$@"; do
  case "$arg" in
    --with-fake-llm) WITH_FAKE_LLM=true ;;
    --no-build) BUILD= ;;
    --keep) KEEP=true ;;
    *) fail "unknown option: $arg" ;;
  esac
done

if [[ "$WITH_FAKE_LLM" == true ]]; then
  export EXTRACTOR=fake FAKE_EXTRACTOR_DELAY_MS=300
else
  export EXTRACTOR=llm
fi

cleanup() {
  dump_logs_on_failure
  local status=$?
  [[ "$KEEP" == true ]] || compose down -v --remove-orphans >/dev/null 2>&1 || true
  return "$status"
}
trap cleanup EXIT

started=$SECONDS
log "Fresh start (project ${PROJECT}): down -v, then up -d ${BUILD}"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d $BUILD --wait --wait-timeout 300

log "migrate exited with $(migrate_exit_code)"
[[ "$(migrate_exit_code)" == 0 ]] || fail "migrate did not exit 0"

log "Health through the web proxy: ${BASE_URL}/api/health"
health="$(api_get /health)"
echo "$health"
[[ "$(jq -r .status <<<"$health")" == ok ]] || fail "health is not ok"

log "Seeded documents"
documents="$(api_get /documents)"
count="$(jq '.documents | length' <<<"$documents")"
jq -r '.documents[] | "  \(.type)\t\(.status)\t\(.title)"' <<<"$documents"
[[ "$count" == 3 ]] || fail "expected 3 seeded documents, got $count"

log "Web app shell and SPA fallback"
curl -fsS "${BASE_URL}/" | grep -q '<div id="root">' || fail "index.html not served"
curl -fsS "${BASE_URL}/settings" | grep -q '<div id="root">' || fail "SPA fallback failed"
curl -fsSI "${BASE_URL}/" | grep -qi '^content-security-policy:' || fail "CSP header missing"

if [[ "$WITH_FAKE_LLM" == true ]]; then
  log "Fake extractor: waiting for all 3 documents to be extracted"
  all_extracted() {
    [[ "$(api_get /documents | jq '[.documents[] | select(.status == "extracted")] | length')" == 3 ]]
  }
  wait_until 120 "3 extracted documents" all_extracted
  [[ -z "$(duplicate_values)" ]] || fail "duplicate values found"
else
  log "No LLM configured: documents stay queued, settings report not configured"
  [[ "$(api_get /settings/llm | jq -r .configured)" == false ]] || fail "settings should be unconfigured"
  [[ "$(jq '[.documents[] | select(.status == "queued")] | length' <<<"$documents")" == 3 ]] ||
    fail "expected all 3 documents queued"
fi

log "Second 'up': migrations already applied, seed adds nothing"
compose up -d --wait --wait-timeout 180
[[ "$(migrate_exit_code)" == 0 ]] || fail "migrate did not exit 0 on the second up"
compose logs --no-color migrate | grep -q 'inserted 0 \[\], skipped 3' || fail "seed was not idempotent"
[[ "$(api_get /documents | jq '.documents | length')" == 3 ]] || fail "documents duplicated"

log "Summary"
compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
echo "Smoke test passed in $((SECONDS - started))s (fake LLM: ${WITH_FAKE_LLM})."
