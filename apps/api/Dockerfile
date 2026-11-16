# syntax=docker/dockerfile:1.7
# API and worker image (one image, two commands). Build from the repo root:
#   docker build -f apps/api/Dockerfile .

ARG NODE_VERSION=22

# ---- base: Node + the pnpm version pinned in package.json ("packageManager") ----
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
COPY package.json ./
RUN corepack enable && corepack install

# ---- deps: download every package from the lockfile alone (cached until it changes) ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# ---- build: install offline, build shared, then the API ----
FROM deps AS build
COPY . .
# This image is Debian (glibc): skip musl-only native binaries of optional dependencies
# (pdfjs-dist's canvas), which would only add size. Applies inside the image build only.
RUN printf 'supportedArchitectures:\n  os: [current]\n  cpu: [current]\n  libc: [glibc]\n' >> pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@doc-review/api..." \
 && pnpm --filter @doc-review/shared build \
 && pnpm --filter @doc-review/api build \
 && pnpm --filter @doc-review/api deploy --prod --legacy /deploy

# ---- runtime: production dependencies, compiled code, migrations and fixtures only ----
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    FIXTURES_DIR=/app/fixtures \
    STORAGE_DIR=/data/storage \
    SECRETS_DIR=/data/secrets
WORKDIR /app
# Volume mount points owned by the unprivileged user, so named volumes inherit that ownership.
RUN mkdir -p /data/storage /data/secrets \
 && chown -R node:node /data \
 && chmod 700 /data/secrets
COPY --from=build --chown=node:node /deploy ./
COPY --chown=node:node fixtures ./fixtures
USER node
EXPOSE 3000
# api: node dist/index.js · worker: node dist/worker/index.js · migrate: node dist/db/migrate-and-seed.js
CMD ["node", "dist/index.js"]
