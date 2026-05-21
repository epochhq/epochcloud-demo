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

Build-time variables (injected via Dockerfile ARGs → `PUBLIC_*` env):

- `PUBLIC_VERSION`, `PUBLIC_COMMIT`, `PUBLIC_BUILD_TIME`

## Local Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000> - most features will show as disabled without the backing services.

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
