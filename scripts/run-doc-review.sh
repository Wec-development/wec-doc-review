#!/usr/bin/env bash
#
# run-doc-review.sh — set up and start the Document Review app with Docker.
#
# Creates a folder, fetches what is needed, starts the stack, waits until it is healthy,
# and prints the web URL.
#
# Modes:
#   release (default)  Downloads docker-compose.release.yml only and pulls prebuilt images
#                      from ghcr.io. No source code or build needed.
#   source             Clones (or updates) the git repository and builds the images locally.
#
# Usage:
#   ./run-doc-review.sh                         # release mode, folder ~/doc-review-app
#   ./run-doc-review.sh --source                # clone the repo and build from source
#   ./run-doc-review.sh --dir ~/apps/doc-review --version 1.0.0
#   ./run-doc-review.sh --stop                  # stop the app (keeps data)
#   ./run-doc-review.sh --reset                 # stop and DELETE all data (database, uploads, key)
#   ./run-doc-review.sh --help
#
# Requirements: Docker Desktop (or Docker Engine with the compose plugin), curl, and git for --source.

set -Eeuo pipefail

# ----- defaults (override with flags or environment variables) ---------------------------------
REPO_SLUG="${REPO_SLUG:-Wec-development/wec-doc-review}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-$HOME/doc-review-app}"
APP_VERSION="${APP_VERSION:-latest}"
MODE="release"
ACTION="up"
OPEN_BROWSER=1
WAIT_SECONDS="${WAIT_SECONDS:-300}"
PROJECT="${PROJECT:-doc-review-app}"   # compose project name; kept separate from a dev checkout

RELEASE_FILE="docker-compose.release.yml"
REPO_URL="https://github.com/${REPO_SLUG}.git"
RAW_URL="https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}/${RELEASE_FILE}"

# ----- output helpers --------------------------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; DIM=""; RESET=""
fi
step() { printf '\n%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
ok()   { printf '%s✔%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf '%s✖ %s%s\n' "$RED" "$*" "$RESET" >&2; exit 1; }

on_error() {
  local code=$?
  printf '\n%s✖ Setup failed (exit %s).%s\n' "$RED" "$code" "$RESET" >&2
  if [ -n "${COMPOSE_READY:-}" ]; then
    printf 'Recent logs:\n' >&2
    compose logs --tail=40 2>/dev/null >&2 || true
    printf '\nFull logs: cd "%s" && %s logs -f\n' "$APP_DIR" "$(compose_cmd_string)" >&2
  fi
  exit "$code"
}
trap on_error ERR

usage() { sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

# ----- arguments -------------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --source)     MODE="source" ;;
    --release)    MODE="release" ;;
    --dir)        [ $# -ge 2 ] || die "--dir needs a path"; APP_DIR="$2"; shift ;;
    --version)    [ $# -ge 2 ] || die "--version needs a value"; APP_VERSION="$2"; shift ;;
    --branch)     [ $# -ge 2 ] || die "--branch needs a value"; BRANCH="$2"; shift
                  RAW_URL="https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}/${RELEASE_FILE}" ;;
    --no-open)    OPEN_BROWSER=0 ;;
    --stop)       ACTION="stop" ;;
    --reset)      ACTION="reset" ;;
    -h|--help)    usage ;;
    *)            die "Unknown option: $1 (see --help)" ;;
  esac
  shift
done

APP_DIR="${APP_DIR/#\~/$HOME}"

# ----- compose wrapper -------------------------------------------------------------------------
compose() {
  if [ "$MODE" = "release" ]; then
    (cd "$APP_DIR" && docker compose -p "$PROJECT" -f "$RELEASE_FILE" "$@")
  else
    (cd "$APP_DIR" && docker compose -p "$PROJECT" "$@")
  fi
}
compose_cmd_string() {
  if [ "$MODE" = "release" ]; then echo "docker compose -p $PROJECT -f $RELEASE_FILE"; else echo "docker compose -p $PROJECT"; fi
}

# ----- checks ----------------------------------------------------------------------------------
require() { command -v "$1" >/dev/null 2>&1 || die "$1 is not installed. $2"; }

check_docker() {
  step "Checking Docker"
  require docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing. Update Docker Desktop."

  if ! docker info >/dev/null 2>&1; then
    if [ "$(uname -s)" = "Darwin" ] && [ -d "/Applications/Docker.app" ]; then
      warn "Docker is not running — starting Docker Desktop…"
      open -a Docker
    else
      die "Docker is not running. Start Docker Desktop (or the Docker service) and run this script again."
    fi
    local waited=0
    until docker info >/dev/null 2>&1; do
      [ "$waited" -ge 120 ] && die "Docker did not start within 120 s. Open Docker Desktop manually and retry."
      sleep 3; waited=$((waited + 3)); printf '.'
    done
    printf '\n'
  fi
  ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null) is running"
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
  fi
}

# Pick a free host port, starting at the preferred one.
free_port() {
  local port="$1"
  while port_in_use "$port"; do port=$((port + 1)); done
  echo "$port"
}

# Read a KEY=value from the app's .env (empty if missing).
env_get() { [ -f "$APP_DIR/.env" ] && grep -E "^$1=" "$APP_DIR/.env" | tail -n1 | cut -d= -f2- || true; }

# Set KEY=value in the app's .env without touching other lines.
env_set() {
  local key="$1" value="$2" file="$APP_DIR/.env"
  touch "$file"
  if grep -qE "^$key=" "$file"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$file" > "$tmp" && mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# ----- prepare files ---------------------------------------------------------------------------
prepare_release() {
  step "Preparing $APP_DIR (release mode)"
  require curl "Install curl and retry."
  mkdir -p "$APP_DIR"
  local tmp; tmp="$(mktemp)"
  if ! curl -fsSL --retry 3 "$RAW_URL" -o "$tmp"; then
    rm -f "$tmp"
    die "Could not download $RELEASE_FILE from $RAW_URL
   Check that the repository is public and the file is pushed to '$BRANCH',
   or run with --source to build from the repository instead."
  fi
  mv "$tmp" "$APP_DIR/$RELEASE_FILE"
  ok "Downloaded $RELEASE_FILE"
}

prepare_source() {
  step "Preparing $APP_DIR (source mode)"
  require git "Install git and retry."
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
    if [ -n "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ]; then
      warn "Local changes found in $APP_DIR — not updating the code."
    else
      git -C "$APP_DIR" checkout --quiet "$BRANCH"
      git -C "$APP_DIR" pull --quiet --ff-only origin "$BRANCH"
      ok "Updated repository ($BRANCH @ $(git -C "$APP_DIR" rev-parse --short HEAD))"
    fi
  elif [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    die "$APP_DIR exists and is not a git repository. Choose another folder with --dir."
  else
    git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    ok "Cloned $REPO_SLUG ($BRANCH)"
  fi
}

configure_env() {
  step "Configuring ports and version"
  [ "$MODE" = "release" ] && env_set APP_VERSION "$APP_VERSION"

  local web api db
  web="$(env_get WEB_HOST_PORT)"; api="$(env_get API_HOST_PORT)"; db="$(env_get DB_HOST_PORT)"
  if [ -n "$(compose ps -q 2>/dev/null)" ]; then
    # Stack already running: keep its ports (they are "in use" by us).
    web="${web:-8080}"; api="${api:-3000}"; db="${db:-5433}"
  else
    web="$(free_port "${web:-8080}")"; api="$(free_port "${api:-3000}")"; db="$(free_port "${db:-5433}")"
  fi
  env_set WEB_HOST_PORT "$web"; env_set API_HOST_PORT "$api"; env_set DB_HOST_PORT "$db"

  WEB_PORT="$web"; API_PORT="$api"; DB_PORT="$db"
  ok "Ports — web $WEB_PORT, api $API_PORT, database $DB_PORT"
  [ "$MODE" = "release" ] && ok "Image version — $APP_VERSION"
}

# ----- run -------------------------------------------------------------------------------------
start_stack() {
  COMPOSE_READY=1
  if [ "$MODE" = "release" ]; then
    step "Pulling images (first run downloads a few hundred MB)"
    if ! compose pull --quiet; then
      die "Could not pull the images. If they are private, run:
   docker login ghcr.io -u <github-user>   (password: a token with read:packages)
   then run this script again — or use --source to build locally."
    fi
    ok "Images ready"
    step "Starting the app"
    compose up -d --remove-orphans
  else
    step "Building and starting the app (first build takes a few minutes)"
    compose up -d --build --remove-orphans
  fi
}

wait_until_ready() {
  step "Waiting for the app to become healthy"
  local url="http://localhost:${WEB_PORT}" waited=0
  until curl -fsS "$url/api/health" >/dev/null 2>&1; do
    if compose ps --status exited --format '{{.Service}} {{.ExitCode}}' 2>/dev/null | grep -vE '^migrate 0$' | grep -q .; then
      die "A service stopped unexpectedly. See: cd \"$APP_DIR\" && $(compose_cmd_string) logs"
    fi
    [ "$waited" -ge "$WAIT_SECONDS" ] && die "The app did not become healthy within ${WAIT_SECONDS}s."
    sleep 3; waited=$((waited + 3)); printf '.'
  done
  printf '\n'
  ok "API healthy"
  local count
  count="$(curl -fsS "$url/api/documents" 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ' || echo "?")"
  ok "Seeded documents visible: ${count:-?}"
}

print_summary() {
  local url="http://localhost:${WEB_PORT}"
  printf '\n%s──────────────────────────────────────────────────────────%s\n' "$DIM" "$RESET"
  printf '%s  Document Review is running%s\n\n' "$BOLD" "$RESET"
  printf '  Web app:   %s%s%s\n' "$BOLD$GREEN" "$url" "$RESET"
  printf '  API:       http://localhost:%s/health\n' "$API_PORT"
  printf '  Database:  localhost:%s  (user/password/db: app)\n\n' "$DB_PORT"
  printf '  Next: open the web app → Settings → choose provider, paste API key,\n'
  printf '        Test connection, Save. The 3 seeded documents then extract.\n\n'
  printf '  Folder:    %s\n' "$APP_DIR"
  printf '  Logs:      cd "%s" && %s logs -f\n' "$APP_DIR" "$(compose_cmd_string)"
  printf '  Stop:      %s --stop%s\n' "$0" "$([ "$MODE" = source ] && echo ' --source')"
  printf '  Reset:     %s --reset%s   (deletes all data)\n' "$0" "$([ "$MODE" = source ] && echo ' --source')"
  printf '  Manage it any time in Docker Desktop → Containers → %s\n' "$PROJECT"
  printf '%s──────────────────────────────────────────────────────────%s\n' "$DIM" "$RESET"

  if [ "$OPEN_BROWSER" -eq 1 ]; then
    if command -v open >/dev/null 2>&1; then open "$url" || true
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true
    fi
  fi
}

stop_stack() {
  [ -d "$APP_DIR" ] || die "Nothing to stop: $APP_DIR does not exist."
  check_docker
  step "Stopping the app (data is kept)"
  compose down
  ok "Stopped. Start again with: $0$([ "$MODE" = source ] && echo ' --source')"
}

reset_stack() {
  [ -d "$APP_DIR" ] || die "Nothing to reset: $APP_DIR does not exist."
  check_docker
  printf '%sThis deletes the database, uploaded PDFs and the encryption key (saved LLM key).%s\n' "$YELLOW" "$RESET"
  read -r -p "Type 'reset' to continue: " answer
  [ "$answer" = "reset" ] || die "Cancelled."
  compose down -v
  ok "All data deleted. Start fresh with: $0$([ "$MODE" = source ] && echo ' --source')"
}

# ----- main ------------------------------------------------------------------------------------
main() {
  case "$ACTION" in
    stop)  stop_stack;  return ;;
    reset) reset_stack; return ;;
  esac

  check_docker
  if [ "$MODE" = "release" ]; then prepare_release; else prepare_source; fi
  configure_env
  start_stack
  wait_until_ready
  print_summary
}

main
