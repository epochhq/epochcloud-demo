# Build stage
FROM docker.io/library/node:26-alpine@sha256:e71ac5e964b9201072425d59d2e876359efa25dc96bb1768cb73295728d6e4ea AS builder

# Enable corepack for pnpm (corepack unbundled in Node 25+, --force needed to overwrite existing shims)
RUN npm install -g corepack --force && corepack enable

WORKDIR /app

# Copy package files. pnpm-workspace.yaml is required for pnpm 11+ —
# it holds the `allowBuilds` decisions without which `pnpm install`
# hard-fails in non-TTY (CI) with ERR_PNPM_IGNORED_BUILDS.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install the exact pnpm version from packageManager field in package.json
RUN corepack install

# Install dependencies (no --frozen-lockfile: survives Renovate lockfile lag between packageManager bumps)
RUN pnpm install

# Copy source
COPY . .

# Build with version info
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_TIME=unknown

ENV PUBLIC_VERSION=${VERSION}
ENV PUBLIC_COMMIT=${COMMIT}
ENV PUBLIC_BUILD_TIME=${BUILD_TIME}

RUN pnpm build

# Prune dev dependencies
RUN pnpm prune --prod

# Runtime stage
FROM docker.io/library/node:26-alpine@sha256:e71ac5e964b9201072425d59d2e876359efa25dc96bb1768cb73295728d6e4ea

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Build info — propagated from builder stage for $env/dynamic/public
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_TIME=unknown
ENV PUBLIC_VERSION=${VERSION}
ENV PUBLIC_COMMIT=${COMMIT}
ENV PUBLIC_BUILD_TIME=${BUILD_TIME}

WORKDIR /app

# Copy built app and production dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Non-root user (node:22-alpine already has 'node' user at uid 1000)
USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "build"]
