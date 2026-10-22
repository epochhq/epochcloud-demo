# epochcloud-demo

SvelteKit 5 demo app for the EpochCloud Kubernetes platform.

## Quick Links

| 🌐 Live Sites                                    | 📦 Repos                                                      |
| :----------------------------------------------- | :------------------------------------------------------------ |
| [🧪 Demo (Prod)](https://demo.<your-domain>)     | [☁️ EpochCloud Infra](https://github.com/EpochBoy/epochcloud) |
| [🔬 Staging](https://demo-staging.<your-domain>) |                                                               |
| [🧑‍💻 Dev](https://demo-dev.<your-domain>)         |                                                               |

## Purpose

**Proof-of-concept app** demonstrating the complete EpochCloud deployment flow using **SvelteKit 5** (the production framework). Shows the same platform integrations as the Go test app:

- **Prometheus metrics** via `prom-client` (`/metrics`)
- **Health probe** (`/health`)
- **RabbitMQ** pub/sub demo via `amqplib`
- **Valkey** cache demo via `ioredis`
- **DefectDojo** security status API client
- **Email** via Maddy SMTP relay (nodemailer)
- **Chaos testing** (error injection, slow responses, load simulation)
- **BetterAuth** client SDK (connects to standalone auth server)
- **Structured logging** (JSON via custom logger)
- **Consumer mode** (KEDA-scaled queue consumer)
- **Rybbit** web analytics (siteId synced from infrastructure)
- **Grafana Faro** - Web Vitals (LCP, CLS, INP, TTFB), JS errors, browser traces via `@grafana/faro-web-sdk`
- **Server-side tracing** - OTLP spans per request (`@opentelemetry/sdk-node`)

## What's in this repo (app concerns)

```text
epochcloud-demo/
├── Dockerfile                    # Multi-stage frozen Bun build
├── package.json                  # Dependencies
├── svelte.config.js              # SvelteKit + adapter-node
├── vite.config.ts                # Vite config
├── VERSION                       # App version
├── src/
│   ├── app.html                  # HTML shell
│   ├── hooks.server.ts           # Metrics middleware, service init
│   ├── instrumentation.server.ts # Tracing bootstrap, loaded before app code
│   ├── lib/
│   │   ├── auth-client.ts        # BetterAuth client SDK
│   │   └── server/
│   │       ├── config.ts         # Env var config
│   │       ├── otel.ts           # OTLP span exporter setup
│   │       ├── logger.ts         # Structured JSON logging
│   │       ├── metrics.ts        # Prometheus metrics (prom-client)
│   │       ├── rabbitmq.ts       # RabbitMQ client (amqplib)
│   │       ├── valkey.ts         # Valkey client (ioredis)
│   │       ├── defectdojo.ts     # DefectDojo API client
│   │       └── smtp.ts           # Email via nodemailer
│   └── routes/
│       ├── +page.svelte          # Landing page (glassmorphism UI)
│       ├── +page.server.ts       # Server data loader
│       ├── health/+server.ts     # GET /health
│       ├── metrics/+server.ts    # GET /metrics
│       ├── version/+server.ts    # GET /version
│       ├── chaos/+server.ts      # GET /chaos
│       ├── rabbitmq/             # /rabbitmq/status, /rabbitmq/publish
│       ├── cache/                # /cache/status, /cache/set, /cache/get
│       ├── defectdojo/           # /defectdojo/status
│       └── email/                # /email/send
└── renovate.json
```

## What's in the infra repo (platform concerns)

All deployment manifests, CI pipelines, monitoring, and promotion live in [epochcloud](https://github.com/EpochBoy/epochcloud):

```text
epochcloud/
├── kubernetes/apps/epochcloud-demo/   # K8s manifests + Kargo pipeline
├── kubernetes/infrastructure/              # Platform services (Maddy, Valkey, etc.)
└── ...
```

## Deploy to dev

`deploy` (on PATH in the devshell) is the only command that ships an image;
`bun run build` / `bun run dev` are local-only. It builds your WORKING TREE
(uncommitted changes included), keyless-signs it as YOUR identity, and pushes
the dev image. No platform checkout, no SOPS, no kubeconfig.

```bash
deploy
```

What happens:

1. The command prints an authorization URL + code in your terminal and waits
   (up to 10 minutes). Open the URL, choose **Sign in via EpochHQ**, approve,
   and return to the terminal. With a live SSO session it is one click; an
   expired code is harmless - re-run `deploy`.
2. Hands-off from there: the image builds from your working tree, gets a
   keyless signature and a SLSA provenance attestation bound to your verified
   email under this product's realm, and pushes to the Harbor dev repo.
3. The dev Kargo Warehouse discovers the new digest and auto-promotes it to
   the dev Stage. Pushing IS the deploy - there is no separate step.

One-time setup: a running `podman machine` and the scoped Harbor push
credentials in a gitignored `.env` (see `.env.example`). The full signing
model is documented in the epochcloud repo: keyless-signing.md.

## Environment Variables

| Variable                      | Default                     | Description                                           |
| ----------------------------- | --------------------------- | ----------------------------------------------------- |
| `ENVIRONMENT`                 | `dev`                       | Environment badge + metrics label                     |
| `PORT`                        | `3000`                      | HTTP listen port                                      |
| `CONSUMER_MODE`               | `false`                     | Only `/health` + `/metrics`, starts RabbitMQ consumer |
| `RABBITMQ_HOST`               | _(disabled)_                | RabbitMQ hostname                                     |
| `RABBITMQ_PORT`               | `5672`                      | RabbitMQ port                                         |
| `RABBITMQ_USERNAME`           |                             | RabbitMQ user                                         |
| `RABBITMQ_PASSWORD`           |                             | RabbitMQ password                                     |
| `RABBITMQ_VHOST`              | `/`                         | RabbitMQ virtual host                                 |
| `RABBITMQ_QUEUE`              | `epochcloud-demo`           | Queue name                                            |
| `VALKEY_HOST`                 | _(disabled)_                | Valkey/Redis host                                     |
| `VALKEY_PORT`                 | `6379`                      | Valkey port                                           |
| `VALKEY_PASSWORD`             |                             | Valkey password                                       |
| `VALKEY_DATABASE`             | `0`                         | Valkey DB number                                      |
| `DEFECTDOJO_URL`              | _(disabled)_                | DefectDojo API URL                                    |
| `DEFECTDOJO_TOKEN`            |                             | DefectDojo API token                                  |
| `SMTP_HOST`                   | _(disabled)_                | Maddy SMTP relay host                                 |
| `SMTP_PORT`                   | `587`                       | SMTP port                                             |
| `SMTP_FROM`                   | `noreply@epoch.engineering` | Sender address                                        |
| `BETTERAUTH_URL`              | _(disabled)_                | BetterAuth server URL                                 |
| `RYBBIT_SITE_ID`              |                             | Rybbit analytics site ID                              |
| `RYBBIT_HOST`                 |                             | Rybbit analytics host                                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(disabled)_                | OTLP gRPC collector URL                               |
| `OTEL_SERVICE_NAME`           |                             | Service name on spans, read by the OTel SDK           |
| `OTEL_RESOURCE_ATTRIBUTES`    |                             | Span resource attributes, read by the SDK             |

Every secret-backed variable (RabbitMQ, Valkey, `DATABASE_URL`,
`DEFECTDOJO_TOKEN`, `NTFY_USER` / `NTFY_PASSWORD`, `CROWDSEC_BOUNCER_KEY`)
also accepts a `<NAME>_FILE` variant naming a file to read the value from;
when both are set the file wins. The charts use the `_FILE` form with mounted
Secret volumes so secret values never sit in process env
(`src/lib/server/secrets.ts`).

Tracing is off when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, so local runs stay
off the exporter's retry loop. The scheme is load-bearing: the OTLP gRPC
exporter picks insecure transport credentials only for `http://`, and gives a
scheme-less value an implicit `https://`, which turns every export into a
failed TLS handshake against a plaintext collector - silently, at the default
log level.

Build metadata (version / commit / build time) is stamped at `vite build` time
by `vite.config.ts` (`define`): the version comes from the `VERSION` file, the
commit from `git rev-parse`, and the build time from the build moment. It is NOT
passed via Docker `--build-arg` - the in-cluster buildah pipeline passes none,
because a per-build arg value busts every layer's cache key and forces a cold
dependency rebuild.

## Local Development

The repo uses a Nix flake + direnv devShell. With direnv allowed, the toolchain
lands on `PATH` and dependencies install automatically:

```bash
direnv allow         # installs from the frozen Bun lock and puts deploy on PATH
bun run dev          # local Vite+ development server
bun run check        # lint/format, native TypeScript, and Svelte diagnostics
bun run test         # Vite+ server tests under Bun
bun run build        # local production build
bun run start        # serve the generated SvelteKit server with Bun
```

The shell does not provision, resize or start a Podman machine. Publishing requires
a separately running machine; local development and checks do not.

The Bun and Node archives are normal Nix file inputs with integrity in `flake.lock`.
Renovate updates their URLs and regenerates that lock through native Nix tasks.
The managed updater must allow that Nix command; the EpochCloud runner config owns
the permission. `bun run check` verifies the canonical runtime versions against all
locked archives offline and refuses stale locks. Updates wait fourteen days, with
exceptions only for the explicitly pinned Bun 1.4.4 and Node 24.22.1 security fixes.

The production runtime is Bun using SvelteKit's existing adapter-node output.
Its preload verifies the actual Bun version against `package.json` before loading
the generated server, so changing only the container's runtime pin fails startup.
Node 24 runs Vite+ development, builds, TypeScript/JavaScript lint and Svelte formatting.
Server regression tests run Vite+ under Bun. Svelte component lint retains the existing ESLint rules because the
target Vite+ linter does not enforce them; `bun run check` runs both scopes.
TypeScript 7
checks owned TypeScript through `tsc`; the official TypeScript 6 API alias is
retained only for SvelteKit and svelte-check, which still use the JavaScript
compiler API. [Microsoft documents this side-by-side arrangement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60).

Open <http://localhost:3000> - most features will show as disabled without the backing services.

Without direnv, enter the shell directly with `nix develop`, or fall back to
`bun install --frozen-lockfile && bun run dev`.

## Deploy

`deploy` is the only command that ships an image. It builds this app's dev image
on your machine, keyless-signs and SLSA-attests it, and pushes it to
`epochcloud/<image>-dev`; the dev Kargo Warehouse auto-promotes it to the dev
Stage. `bun run build` and `bun run dev` are local-only and never deploy.

```bash
deploy            # build + sign + push the dev image
deploy --help     # required env, credentials, options
```

It needs only podman (with a running `podman machine`), a Harbor robot scoped to
push `epochcloud/*-dev`, and a dev-user in your tenant Keycloak realm for the
in-browser signing approval - no cosign key, no SOPS, no cluster access. Copy
`.env.example` to `.env` (gitignored; direnv loads it) and fill in the credentials.

## API Routes

| Path                 | Method   | Description                             |
| -------------------- | -------- | --------------------------------------- |
| `/`                  | GET      | Landing page                            |
| `/health`            | GET      | Health check (always 200)               |
| `/metrics`           | GET      | Prometheus scrape endpoint              |
| `/version`           | GET      | Build info JSON                         |
| `/chaos`             | GET      | `?action=error\|slow\|load&count=N`     |
| `/rabbitmq/status`   | GET      | RabbitMQ connection + consumed messages |
| `/rabbitmq/publish`  | GET/POST | Publish message to queue                |
| `/cache/status`      | GET      | Valkey connection status                |
| `/cache/set`         | GET      | Set key: `?key=...&value=...&ttl=300`   |
| `/cache/get`         | GET      | Get key: `?key=...`                     |
| `/defectdojo/status` | GET      | Products + findings summary             |
| `/email/send`        | GET/POST | Send test email via Maddy               |
