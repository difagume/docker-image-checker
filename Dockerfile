# syntax=docker/dockerfile:1

# ============================================
# Stage 0: Base images
# Bun installs dependencies and builds the app;
# Node.js executes the `next` binary (via its
# shebang) and serves the standalone output.
# The runner stage stays Bun-free on purpose.
# ============================================
ARG NODE_VERSION=26-slim
ARG BUN_VERSION=1

FROM node:${NODE_VERSION} AS base

# Bun source image; FROM expands ARG while COPY --from cannot
FROM oven/bun:${BUN_VERSION} AS bun

FROM base AS build-base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# ============================================
# Stage 2: Install dependencies
# ============================================
FROM build-base AS deps
WORKDIR /app

# Install dependencies with frozen lockfile for reproducible builds
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

# ============================================
# Stage 3: Build Next.js application in standalone mode
# ============================================
FROM build-base AS builder
WORKDIR /app

# Copy project dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application. `bun run build` resolves the `next`
# binary through its shebang, so the build itself runs on Node.js —
# the same code path validated in local development.
RUN --mount=type=cache,target=/app/.next/cache \
  bun run build

# ============================================
# Stage 4: Run Next.js application
# ============================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy production assets
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Create data directory for notification state persistence
RUN mkdir -p data && chown nextjs:nodejs data

# Define volume for persistent data
VOLUME /app/data

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
