# Single-stage Docker build for the reflect-live worker.
#
# No tsc compile — bun executes TypeScript directly at runtime. Skipping
# the build step avoids the moduleResolution=NodeNext .js-extension
# gymnastics entirely. The worker is a single long-running process and
# startup cost of running .ts is negligible.
#
# Railway settings:
#   Builder        : Dockerfile
#   Root Directory : (blank — build context must be the monorepo root)
#   Dockerfile Path: apps/worker/Dockerfile

FROM oven/bun:1-alpine
WORKDIR /app

# Native-build deps for better-sqlite3 (a scripts/ workspace dep).
# Needed even though the worker doesn't use it — bun install resolves every
# workspace including scripts/.
RUN apk add --no-cache python3 make g++ gcc libc-dev

# Copy every workspace's manifest first so `bun install` can hoist deps.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY scripts/package.json ./scripts/

RUN bun install --frozen-lockfile

# Copy source needed for the worker
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

WORKDIR /app/apps/worker

# bun runs TS directly — no build step.
CMD ["bun", "run", "src/index.ts"]
