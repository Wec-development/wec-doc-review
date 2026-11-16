#!/usr/bin/env bash
# Interrupts the worker in the middle of an extraction and checks the job still completes
# exactly once: never stuck in `extracting`, never duplicated values. Uses the fake extractor
# (test-only) made slow, so the job is reliably mid-flight when interrupted.
#
#   scripts/restart-test.sh          # `docker compose restart worker` (SIGTERM: job released)
#   scripts/restart-test.sh --kill   # `docker compose kill worker` (no shutdown: lease expiry)
#   scripts/restart-test.sh --all    # `docker compose restart` (every service, Postgres included)
#   options: --no-build, --keep
set -euo pipefail
PROJECT="${PROJECT:-doc-review-restart}"
export WEB_HOST_PORT="${WEB_HOST_PORT:-18081}" API_HOST_PORT="${API_HOST_PORT:-13001}"
export DB_HOST_PORT="${DB_HOST_PORT:-15434}"
source "$(dirname "${BASH_SOURCE[0]}")/docker-lib.sh"

MODE=restart
BUILD=--build
KEEP=false
for arg in "$@"; do
  case "$arg" in
    --kill) MODE=kill ;;
    --all) MODE=all ;;
    --no-build) BUILD= ;;
    --keep) KEEP=true ;;
    *) fail "unknown option: $arg" ;;
  esac
done

# Slow fake extraction (20 s) > the worker's 10 s shutdown timeout, so a restart must release
# the job; a short lease makes the kill test reclaim it in seconds instead of minutes.
export EXTRACTOR=fake FAKE_EXTRACTOR_DELAY_MS=20000 JOB_LEASE_SECONDS=15 WORKER_CONCURRENCY=4

cleanup() {
  dump_logs_on_failure
  local status=$?
  [[ "$KEEP" == true ]] || compose down -v --remove-orphans >/dev/null 2>&1 || true
  return "$status"
}
trap cleanup EXIT

version_status() {
  api_get "/documents/$1" | jq -r .version.status
}
is_status() {
  [[ "$(version_status "$1")" == "$2" ]]
}
job_summary() {
  compose exec -T db psql -U app -d app -tA -c \
    "select status || ' attempts=' || attempts from extraction_jobs where version_id = '$1' order by created_at"
}

started=$SECONDS
log "Fresh stack (project ${PROJECT}), slow fake extractor"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d $BUILD --wait --wait-timeout 300 >/dev/null

log "Upload fixtures/documents/invoice-001.v2.pdf"
accepted="$(curl -fsS -X POST "${BASE_URL}/api/documents" \
  -F type=invoice -F title='Restart test invoice' \
  -F "file=@${ROOT_DIR}/fixtures/documents/invoice-001.v2.pdf;type=application/pdf")"
document_id="$(jq -r .documentId <<<"$accepted")"
version_id="$(jq -r .versionId <<<"$accepted")"
echo "document ${document_id}"

wait_until 60 "the upload to start extracting" is_status "$document_id" extracting
echo "status: extracting — interrupting the worker (${MODE})"

if [[ "$MODE" == restart ]]; then
  compose restart worker >/dev/null
  echo "after restart: $(version_status "$document_id"); job: $(job_summary "$version_id")"
  [[ "$(version_status "$document_id")" != extracting ]] ||
    fail "graceful restart left the version extracting (job not released)"
elif [[ "$MODE" == all ]]; then
  compose restart >/dev/null
  wait_until 120 "the API to answer again" api_get /health
  echo "after full restart: $(version_status "$document_id"); job: $(job_summary "$version_id")"
else
  compose kill worker >/dev/null
  echo "after kill: $(version_status "$document_id") (lease held by the dead worker)"
  compose up -d worker >/dev/null
fi

log "Waiting for the job to complete after the ${MODE}"
wait_until 120 "the upload to be extracted" is_status "$document_id" extracted

detail="$(api_get "/documents/${document_id}")"
fields="$(jq '[.values[].field] | length' <<<"$detail")"
unique_fields="$(jq '[.values[].field] | unique | length' <<<"$detail")"
echo "values: ${fields} (unique fields: ${unique_fields}); job: $(job_summary "$version_id")"
[[ "$fields" == 5 && "$unique_fields" == 5 ]] || fail "expected 5 unique values, got ${fields}"
[[ -z "$(duplicate_values)" ]] || fail "duplicate values in the database"
stuck="$(compose exec -T db psql -U app -d app -tA -c \
  "select count(*) from document_versions where status = 'extracting'")"

log "Summary"
echo "mode=${MODE}: extracted once, 5 values, no duplicates; versions still extracting: ${stuck}"
echo "Restart test passed in $((SECONDS - started))s."
