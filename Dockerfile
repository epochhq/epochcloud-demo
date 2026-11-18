# Every stage that runs a command runs on the build machine's own platform
# (BUILDPLATFORM), so a linux/amd64 image builds on an arm64 machine with no
# emulated step, and the same file builds natively on amd64. Only the last
# stage is the target platform, and it runs nothing: it copies. Each pinned
# digest is a multi-platform index, so every platform can pull it.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS dependencies
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM --platform=$BUILDPLATFORM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS node-tooling

FROM dependencies AS builder
COPY --from=node-tooling /usr/local/bin/node /usr/local/bin/node
USER root
# The build reads git metadata without a per-commit dependency-layer cache key.
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY . .
# Lint, type check and tests run in the build, so an image on either lane cannot
# exist for a tree that fails them. A client hook is not a gate.
RUN bun run lint && bun run typecheck && bun run check:svelte && bun run test
RUN node -e 'if (process.versions.node !== require("./package.json").engines.node) throw new Error("Node tooling version differs from package.json")' && bun run build

# The target platform's production packages, installed by the build platform's
# Bun. Bun names amd64 x64; no production dependency needs an install script.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS production-dependencies
ARG TARGETARCH
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN case "$TARGETARCH" in amd64) cpu=x64 ;; arm64) cpu=arm64 ;; *) echo "no Bun CPU name for $TARGETARCH" >&2; exit 1 ;; esac \
	&& bun install --frozen-lockfile --production --ignore-scripts --cpu="$cpu" --os=linux --libc=musl

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a
WORKDIR /app
COPY --from=builder --chown=bun:bun /app/build ./build
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json runtime-check.js ./
USER bun
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["bun", "--preload", "./runtime-check.js", "./build/index.js"]
