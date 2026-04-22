# Single-stage Docker build for the reflect-live worker.
# Multi-stage was failing because bun workspace symlinks don't survive
# COPY --from across stages. Single-stage keeps all resolved links intact.
# Image is a bit bigger but deploy is reliable, which matters more here.
#
# Railway settings:
#   Builder        : Dockerfile
#   Root Directory : (blank — build context must be the monorepo root)
#   Dockerfile Path: apps/worker/Dockerfile

FROM oven/bun:1-alpine
WORKDIR /app

# Native-build deps for better-sqlite3 (a scripts/ workspace dep).
# Needed even though the worker doesn't use it at runtime — bun install
# resolves every workspace including scripts/.
RUN apk add --no-cache python3 make g++ gcc libc-dev

# Copy every workspace's manifest first so `bun install` can hoist deps.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY scripts/package.json ./scripts/

RUN bun install --frozen-lockfile

# Copy source needed to build the worker
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# Compile TypeScript → apps/worker/dist
RUN cd apps/worker && bun run build

WORKDIR /app/apps/worker

# Use `bun run` (alias for bun's node-compat runtime) to execute the
# compiled JS. oven/bun:1-alpine doesn't ship a separate `node` binary.
CMD ["bun", "run", "dist/index.js"]
