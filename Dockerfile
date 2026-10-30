FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS dependencies
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS node-tooling

FROM dependencies AS builder
COPY --from=node-tooling /usr/local/bin/node /usr/local/bin/node
USER root
# The build reads git metadata without a per-commit dependency-layer cache key.
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY . .
RUN node -e 'if (process.versions.node !== require("./package.json").engines.node) throw new Error("Node tooling version differs from package.json")' && bun run build

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS production-dependencies
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production --ignore-scripts

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
