# epochcloud-demo

SvelteKit 5 demo app for the EpochCloud Kubernetes platform.

## Quick Links

| 🌐 Live Sites | 📦 Repos |
| :------------- | :-------- |
| [🧪 Demo (Prod)](https://demo.<your-domain>) | [☁️ EpochCloud Infra](https://github.com/EpochBoy/epochcloud) |
| [🔬 Staging](https://demo-staging.<your-domain>) | |
| [🧑‍💻 Dev](https://demo-dev.<your-domain>) | |

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

## What's in this repo (app concerns)

```text
epochcloud-demo/
├── Dockerfile                    # Multi-stage Node.js build
├── package.json                  # Dependencies
├── svelte.config.js              # SvelteKit + adapter-node
├── vite.config.ts                # Vite config
├── VERSION                       # App version
├── src/
│   ├── app.html                  # HTML shell
│   ├── hooks.server.ts           # Metrics middleware, service init
│   ├── lib/
│   │   ├── auth-client.ts        # BetterAuth client SDK
│   │   └── server/
│   │       ├── config.ts         # Env var config
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
`pnpm build` / `pnpm dev` are local-only. It builds your WORKING TREE
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

| Variable | Default | Description |
| --- | --- | --- |
| `ENVIRONMENT` | `dev` | Environment badge + metrics label |
| `PORT` | `3000` | HTTP listen port |
| `CONSUMER_MODE` | `false` | Only `/health` + `/metrics`, starts RabbitMQ consumer |
| `RABBITMQ_HOST` | _(disabled)_ | RabbitMQ hostname |
| `RABBITMQ_PORT` | `5672` | RabbitMQ port |
| `RABBITMQ_USERNAME` | | RabbitMQ user |
| `RABBITMQ_PASSWORD` | | RabbitMQ password |
| `RABBITMQ_VHOST` | `/` | RabbitMQ virtual host |
| `RABBITMQ_QUEUE` | `epochcloud-demo` | Queue name |
| `VALKEY_HOST` | _(disabled)_ | Valkey/Redis host |
| `VALKEY_PORT` | `6379` | Valkey port |
| `VALKEY_PASSWORD` | | Valkey password |
| `VALKEY_DATABASE` | `0` | Valkey DB number |
| `DEFECTDOJO_URL` | _(disabled)_ | DefectDojo API URL |
| `DEFECTDOJO_TOKEN` | | DefectDojo API token |
| `SMTP_HOST` | _(disabled)_ | Maddy SMTP relay host |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_FROM` | `noreply@epoch.engineering` | Sender address |
| `BETTERAUTH_URL` | _(disabled)_ | BetterAuth server URL |
| `RYBBIT_SITE_ID` | | Rybbit analytics site ID |
| `RYBBIT_HOST` | | Rybbit analytics host |

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
direnv allow   # first time; runs `pnpm install` and puts `deploy` on PATH
pnpm dev       # local SvelteKit dev server (vite dev)
pnpm build     # local production build (vite build)
```

Open <http://localhost:3000> - most features will show as disabled without the backing services.

Without direnv, enter the shell directly with `nix develop`, or fall back to
`pnpm install && pnpm dev`.

## Deploy

`deploy` is the only command that ships an image. It builds this app's dev image
on your machine, keyless-signs and SLSA-attests it, and pushes it to
`epochcloud/<image>-dev`; the dev Kargo Warehouse auto-promotes it to the dev
Stage. `pnpm build` and `pnpm dev` are local-only and never deploy.

```bash
deploy            # build + sign + push the dev image
deploy --help     # required env, credentials, options
```

It needs only podman (with a running `podman machine`), a Harbor robot scoped to
push `epochcloud/*-dev`, and a dev-user in your tenant Keycloak realm for the
in-browser signing approval - no cosign key, no SOPS, no cluster access. Copy
`.env.example` to `.env` (gitignored; direnv loads it) and fill in the credentials.

## API Routes

| Path | Method | Description |
| --- | --- | --- |
| `/` | GET | Landing page |
| `/health` | GET | Health check (always 200) |
| `/metrics` | GET | Prometheus scrape endpoint |
| `/version` | GET | Build info JSON |
| `/chaos` | GET | `?action=error\|slow\|load&count=N` |
| `/rabbitmq/status` | GET | RabbitMQ connection + consumed messages |
| `/rabbitmq/publish` | GET/POST | Publish message to queue |
| `/cache/status` | GET | Valkey connection status |
| `/cache/set` | GET | Set key: `?key=...&value=...&ttl=300` |
| `/cache/get` | GET | Get key: `?key=...` |
| `/defectdojo/status` | GET | Products + findings summary |
| `/email/send` | GET/POST | Send test email via Maddy |
