# syntax=docker/dockerfile:1.7
# Review UI: a static Vite build served by unprivileged nginx, which also proxies /api to the
# API. Build from the repo root:  docker build -f apps/web/Dockerfile .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

FROM deps AS build
COPY . .
# Same-origin API: the browser calls /api/..., which nginx proxies (no build-time API URL).
ENV VITE_API_URL=/api
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@doc-review/web..." \
 && pnpm --filter @doc-review/shared build \
 && pnpm --filter @doc-review/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
