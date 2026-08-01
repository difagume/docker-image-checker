# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Dependencies Installation Stage
# ============================================
ARG NODE_VERSION=26-slim

FROM node:${NODE_VERSION} AS base

# Corepack was decoupled from Node.js starting with v25 — install it manually
RUN npm install -g corepack@latest --force

# ============================================
# Stage 2: Install dependencies
# ============================================
FROM base AS deps
WORKDIR /app

# Install dependencies with frozen lockfile for reproducible builds
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  corepack enable pnpm && pnpm install --frozen-lockfile

# ============================================
# Stage 3: Build Next.js application in standalone mode
# ============================================
FROM base AS builder
WORKDIR /app

# Copy project dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN --mount=type=cache,target=/app/.next/cache \
  corepack enable pnpm && pnpm build

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
