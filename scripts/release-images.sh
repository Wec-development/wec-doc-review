#!/usr/bin/env bash
# Builds and publishes the release images used by docker-compose.release.yml.
#
#   scripts/release-images.sh 1.0.0           # linux/amd64 + linux/arm64, push :1.0.0 and :latest
#   scripts/release-images.sh 1.0.0 --load    # current platform only, load into local Docker (test)
#
# Publishing needs `docker login ghcr.io` first (a token with write:packages). This script never
# reads, prints or stores a token; it only checks that a ghcr.io login exists.
set -euo pipefail

REGISTRY="${REGISTRY:-ghcr.io/wec-development}"
REPO_URL="https://github.com/Wec-development/wec-doc-review"
BUILDER="doc-review-release"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf '\033[31mError: %s\033[0m\n' "$*" >&2
  exit 1
}

VERSION="${1:-}"
MODE="${2:-push}"
[[ -n "$VERSION" ]] || fail "usage: scripts/release-images.sh <version> [--load]   e.g. 1.0.0"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] ||
  fail "version must look like 1.0.0 (or 1.0.0-rc.1), got: $VERSION"
[[ "$MODE" == push || "$MODE" == --load ]] || fail "unknown option: $MODE (only --load)"
command -v docker >/dev/null || fail "docker is not installed"
docker buildx version >/dev/null 2>&1 || fail "docker buildx is not available"

# True when the Docker client has credentials for ghcr.io (prints nothing about them).
logged_in_to_ghcr() {
  local config="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
  [[ -f "$config" ]] && grep -q '"ghcr.io"' "$config"
}

if [[ "$MODE" == --load ]]; then
  # One platform (this machine's), loaded into local Docker for testing; nothing is pushed.
  PLATFORMS="linux/$(docker version --format '{{.Server.Arch}}')"
  OUTPUT=(--load)
  BUILDER_ARGS=()
else
  logged_in_to_ghcr ||
    fail "not logged in to ghcr.io. Run: docker login ghcr.io -u <github-user> (token with write:packages)"
  PLATFORMS="linux/amd64,linux/arm64"
  OUTPUT=(--push)
  # Multi-platform images need a docker-container builder (created once, then reused).
  docker buildx inspect "$BUILDER" >/dev/null 2>&1 ||
    docker buildx create --name "$BUILDER" --driver docker-container >/dev/null
  BUILDER_ARGS=(--builder "$BUILDER")
fi

REVISION="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null)" ]]; then
  printf '\033[33mWarning: the working tree has uncommitted changes; they will be in the images.\033[0m\n'
fi

for app in api web; do
  image="${REGISTRY}/doc-review-${app}"
  printf '\n==> %s:%s and :latest (%s, %s)\n' "$image" "$VERSION" "$PLATFORMS" "${MODE#--}"
  # ${arr[@]+...}: an empty array is "unbound" under set -u in macOS bash 3.2.
  docker buildx build ${BUILDER_ARGS[@]+"${BUILDER_ARGS[@]}"} \
    --platform "$PLATFORMS" \
    --file "$ROOT_DIR/apps/${app}/Dockerfile" \
    --tag "${image}:${VERSION}" \
    --tag "${image}:latest" \
    --label "org.opencontainers.image.source=${REPO_URL}" \
    --label "org.opencontainers.image.version=${VERSION}" \
    --label "org.opencontainers.image.revision=${REVISION}" \
    --label "org.opencontainers.image.title=doc-review-${app}" \
    "${OUTPUT[@]}" \
    "$ROOT_DIR"
done

printf '\nDone: %s/doc-review-{api,web}:%s (%s).\n' "$REGISTRY" "$VERSION" "${MODE#--}"
if [[ "$MODE" == push ]]; then
  echo "Run anywhere with: APP_VERSION=${VERSION} docker compose -f docker-compose.release.yml up -d"
fi
