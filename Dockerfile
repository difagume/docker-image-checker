# syntax=docker/dockerfile:1

# ============================================
# Full Bun image: Bun installs dependencies,
# builds the app AND serves the standalone
# output. No Node.js involved.
# ============================================
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS base

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM base AS deps
WORKDIR /app

# Install dependencies with frozen lockfile for reproducible builds
COPY --link package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

# ============================================
# Stage 2: Build Next.js application in standalone mode
# ============================================
FROM base AS builder
WORKDIR /app

# Copy project dependencies from deps stage
COPY --link --from=deps /app/node_modules ./node_modules
COPY --link . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application on the Bun runtime.
# `.env` is excluded from the build context (see .dockerignore);
# `--env-file` in the build script tolerates its absence.
RUN --mount=type=cache,target=/app/.next/cache \
  bun run build

# ============================================
# Stage 3: Run Next.js application
# ============================================
FROM base AS runner
WORKDIR /app

LABEL org.opencontainers.image.source=https://github.com/difagume/docker-image-checker

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user for security (oven/bun ships no adduser; write entries directly)
# NOTE: COPY --link layers cannot resolve named users, so --chown below uses
# the numeric 1001:1001 assigned here.
RUN echo "nodejs:x:1001:" >> /etc/group \
  && echo "nextjs:x:1001:1001::/app:/bin/false" >> /etc/passwd

# Copy production assets
COPY --link --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Create data directory for notification state persistence
RUN mkdir -p data && chown nextjs:nodejs data

# Automatically leverage output traces to reduce image size
COPY --link --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --link --from=builder --chown=1001:1001 /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Neutralize any ENTRYPOINT inherited from the base image so CMD
# controls execution exactly.
ENTRYPOINT []
CMD ["bun", "./server.js"]
