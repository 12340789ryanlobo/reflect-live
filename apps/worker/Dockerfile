# Fallback deterministic build for the reflect-live worker.
# Railway auto-detects this when 'Dockerfile Path' is set to apps/worker/Dockerfile
# and 'Root Directory' is left empty (so build context is the monorepo root).
#
# Why a Dockerfile in addition to nixpacks.toml?
# Nixpacks sometimes doesn't reliably install bun in nested workspace setups.
# This Dockerfile pins the exact toolchain and build steps.

FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Native build tools — required because scripts/ has better-sqlite3 as a
# dependency (used by the local seed script, not the worker runtime). Bun
# still resolves that workspace during `install`, so node-gyp needs python.
RUN apk add --no-cache python3 make g++ gcc libc-dev

# Copy the minimal set of files needed to resolve workspace installs
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY scripts/package.json ./scripts/

RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock
COPY --from=deps /app/tsconfig.base.json ./tsconfig.base.json

# Re-install at each workspace so symlinks exist
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# Build the worker
RUN cd apps/worker && bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# Copy installed deps + built worker
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

WORKDIR /app/apps/worker

# Run the compiled JS under bun's node compat — oven/bun image doesn't ship
# `node` separately but `bun run` handles plain JS fine.
CMD ["bun", "run", "dist/index.js"]
