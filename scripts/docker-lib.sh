#!/usr/bin/env bash
# Shared helpers for the Docker test scripts. They run as their own compose project with their
# own ports and volumes, so `down -v` here never touches your development stack or its data.

PROJECT="${PROJECT:-doc-review-smoke}"
export WEB_HOST_PORT="${WEB_HOST_PORT:-18080}"
export API_HOST_PORT="${API_HOST_PORT:-13000}"
export DB_HOST_PORT="${DB_HOST_PORT:-15433}"
BASE_URL="http://localhost:${WEB_HOST_PORT}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

compose() {
  docker compose --project-directory "$ROOT_DIR" -f "$ROOT_DIR/docker-compose.yml" -p "$PROJECT" "$@"
}

log() {
  printf '\n\033[1m==> %s\033[0m\n' "$*"
}

fail() {
  printf '\033[31mFAIL: %s\033[0m\n' "$*" >&2
  exit 1
}

# wait_until <timeout-seconds> <description> <command...>: polls until the command succeeds.
wait_until() {
  local timeout="$1" description="$2"
  shift 2
  local deadline=$((SECONDS + timeout))
  until "$@" >/dev/null 2>&1; do
    if ((SECONDS >= deadline)); then
      fail "timed out after ${timeout}s waiting for ${description}"
    fi
    sleep 2
  done
}

api_get() {
  curl -fsS "${BASE_URL}/api$1"
}

# Prints recent logs of every service when a script fails, to make CI failures readable.
dump_logs_on_failure() {
  local status=$?
  if ((status != 0)); then
    printf '\n--- docker compose logs (last 60 lines per service) ---\n' >&2
    compose logs --no-color --tail 60 >&2 || true
  fi
  return "$status"
}

# Exit code of the one-shot migrate container (0 = migrations and seed succeeded).
migrate_exit_code() {
  docker inspect --format '{{.State.ExitCode}}' "$(compose ps -aq migrate | head -n1)"
}

# Every (version, field) that has more than one value: must always be empty.
duplicate_values() {
  compose exec -T db psql -U app -d app -tA -c \
    "select version_id || ':' || field from extracted_values group by version_id, field having count(*) > 1"
}
