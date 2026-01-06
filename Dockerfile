# Stage 1: Build
FROM node:20-alpine AS builder

# Install git and pnpm
RUN apk add --no-cache git && \
    corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code and .git directory for version info
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html tsr.config.json ./
COPY src/ ./src/
COPY .git/ ./.git/

# Capture version info (git tag or commit hash)
RUN git describe --tags --always > version.txt 2>/dev/null || \
    git rev-parse --short HEAD > version.txt 2>/dev/null || \
    echo "unknown" > version.txt

# Build the application (TypeScript compile + Vite build)
RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/version.txt ./version.txt

# Create data directory for configuration persistence
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3001

# Note: For mDNS device discovery to work, run with --network host
# Example: docker run --network host -v shelly-data:/app/data ghcr.io/<owner>/shelly-toolbox

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/shelly || exit 1

# Start the application
CMD ["node", "dist/server/index.js"]
