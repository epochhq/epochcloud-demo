# epochcloud-demo

SvelteKit 3 and Svelte 5 demo app for the EpochCloud Kubernetes platform.

## Quick Links

| 🌐 Live Sites                                    | 📦 Repos                                                      |
| :----------------------------------------------- | :------------------------------------------------------------ |
| [🧪 Demo (Prod)](https://demo.<your-domain>)     | [☁️ EpochCloud Infra](https://github.com/EpochBoy/epochcloud) |
| [🔬 Staging](https://demo-staging.<your-domain>) |                                                               |
| [🧑‍💻 Dev](https://demo-dev.<your-domain>)         |                                                               |

## Purpose

**Proof-of-concept app** demonstrating the complete EpochCloud deployment flow using **SvelteKit 3 and Svelte 5** (the production framework). Shows the same platform integrations as the Go test app:

- **Prometheus metrics** via `prom-client` (`/metrics`)
- **Health probe** (`/health`)
- **RabbitMQ** pub/sub demo via `amqplib`
- **Valkey** cache demo via `ioredis`
- **DefectDojo** security status API client
- **Email** via Maddy SMTP relay (nodemailer)
- **BetterAuth** HTTP status and session forwarding to the standalone auth server
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
├── vite.config.ts                # SvelteKit + official Bun adapter
├── VERSION                       # App version
├── src/
│   ├── app.html                  # HTML shell
│   ├── hooks.server.ts           # Metrics middleware, service init
│   ├── instrumentation.server.ts # Tracing bootstrap, loaded before app code
│   ├── lib/
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
│       ├── status/[name]/        # GET: the server's latest check of one integration
│       ├── robots.txt/           # GET /robots.txt
│       ├── email/send            # POST, signed in: test mail to the session's address
│       ├── ntfy/send, ntfy/topic # POST / GET, signed in: test notification to the user's own topic
│       ├── rabbitmq/ cache/ cnpg/ features/ knative/ prometheus/increment
│       │                         # interactive demos, all signed in; writes are form POSTs
│       └── auth/session          # GET: who the server sees behind the cookies
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

## Public surface and timeouts

The anonymous page reads a status snapshot that the server refreshes itself
(`src/lib/server/snapshot.ts`, `checks.ts`): a visitor without a session cookie
never causes an upstream call, and a check that did not run (not configured,
unavailable until the platform offers a credential, no traffic yet) answers 200
with `state: not-running`, never a 5xx. Every other route needs the app's own
sign-in, decided once in the `handle` hook (`src/lib/server/access.ts`), is a
form-encoded POST when it changes anything so SvelteKit's origin check always
applies, and takes no address, topic or URL from the request; the cache routes
take a key of up to 64 characters, always under the `demo:` prefix.

Bun cuts a request that writes nothing for its idle timeout, and the app would
still log 200 for it. The timeout is stated in `src/lib/limits.ts` at Bun's
default, every outbound call is bounded, and `HANDLER_WAITS` lists the whole
chain of waits of each handler; `tests/local/budgets.test.ts` sums every chain.
The Prometheus and Linkerd tabs render a data array of namespace-limited queries
(`src/lib/server/proofs.ts`): one more entry proves one more capability.

## Environment Variables

| Variable                      | Default             | Description                                           |
| ----------------------------- | ------------------- | ----------------------------------------------------- |
| `ENVIRONMENT`                 | `dev`               | Environment badge + metrics label                     |
| `PORT`                        | `3000`              | HTTP listen port                                      |
| `CONSUMER_MODE`               | `false`             | Only `/health` + `/metrics`, starts RabbitMQ consumer |
| `RABBITMQ_HOST`               | _(disabled)_        | RabbitMQ hostname                                     |
| `RABBITMQ_PORT`               | `5672`              | RabbitMQ port                                         |
| `RABBITMQ_USERNAME`           |                     | RabbitMQ user                                         |
| `RABBITMQ_PASSWORD`           |                     | RabbitMQ password                                     |
| `RABBITMQ_VHOST`              | `/`                 | RabbitMQ virtual host                                 |
| `RABBITMQ_QUEUE`              | `epochcloud-demo`   | Queue name                                            |
| `VALKEY_HOST`                 | _(disabled)_        | Valkey/Redis host                                     |
| `VALKEY_PORT`                 | `6379`              | Valkey port                                           |
| `VALKEY_PASSWORD`             |                     | Valkey password                                       |
| `VALKEY_DATABASE`             | `0`                 | Valkey DB number                                      |
| `DEFECTDOJO_URL`              | _(disabled)_        | DefectDojo API URL                                    |
| `DEFECTDOJO_TOKEN`            |                     | DefectDojo API token                                  |
| `SMTP_HOST`                   | _(disabled)_        | Maddy SMTP relay host                                 |
| `SMTP_PORT`                   | `587`               | SMTP port                                             |
| `SMTP_FROM`                   | _(email disabled)_  | Sender address; the test mail needs it                |
| `POD_NAMESPACE`               | pod DNS search path | Namespace the Prometheus proofs are limited to        |
| `DEFECTDOJO_PRODUCT`          | `epochcloud-demo`   | The only product whose findings the page shows        |
| `NTFY_URL`                    | _(disabled)_        | ntfy server; topics are `NTFY_TOPIC_PREFIX-<env>-...` |
| `NTFY_TOPIC_PREFIX`           | `epochcloud-demo`   | Prefix every published topic must start with          |
| `FARO_RECEIVER_URL`           | _(relay disabled)_  | Collector the browser telemetry relay forwards to     |
| `PROMETHEUS_URL`              | _(disabled)_        | Prometheus the proofs query                           |
| `BETTERAUTH_URL`              | _(disabled)_        | BetterAuth server URL                                 |
| `RYBBIT_SITE_ID`              |                     | Rybbit analytics site ID                              |
| `RYBBIT_HOST`                 |                     | Rybbit analytics host                                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(disabled)_        | OTLP gRPC collector URL                               |
| `OTEL_SERVICE_NAME`           |                     | Service name on spans, read by the OTel SDK           |
| `OTEL_RESOURCE_ATTRIBUTES`    |                     | Span resource attributes, read by the SDK             |

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

The production runtime is Bun using SvelteKit's first-party `@sveltejs/adapter-bun`.
The same emitted image serves multiple hosts; no origin is baked into the build.
The adapter uses Host and defaults to HTTPS for the public origin. Behind the
existing trusted proxy, `PROTOCOL_HEADER=X-Forwarded-Proto` preserves its scheme;
only set header overrides when the proxy overwrites them. Cross-origin form
requests remain subject to SvelteKit's default CSRF checks.
Its preload verifies the actual Bun version against `package.json` before loading
the generated server, so changing only the container's runtime pin fails startup.
Node 24 runs supported development, TypeScript/JavaScript lint and Svelte formatting tools.
Production builds run Vite+ under Bun as required by the adapter.
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

Anonymous routes answer without a sign-in. Every other route needs a verified
BetterAuth session, and a request that changes anything must be a form-encoded
POST. `src/lib/server/access.ts` holds the list and `tests/local/access.test.ts`
checks every route module against it.

| Path                                  | Method    | Access    | Description                                                      |
| ------------------------------------- | --------- | --------- | ---------------------------------------------------------------- |
| `/`                                   | GET       | anonymous | Landing page                                                     |
| `/health`                             | GET       | anonymous | Liveness and readiness (always 200)                              |
| `/version`                            | GET       | anonymous | Build info JSON                                                  |
| `/robots.txt`                         | GET       | anonymous | Crawler policy                                                   |
| `/metrics`                            | GET       | anonymous | Prometheus scrape endpoint; the chart does not route it publicly |
| `/status/<name>`                      | GET       | anonymous | The server's latest check of one integration                     |
| `/auth/session`                       | GET       | anonymous | Who the server sees behind the session cookie                    |
| `/api/faro/collect`                   | POST      | anonymous | Browser telemetry relay, size-capped and limited per client      |
| `/email/send`                         | POST      | signed in | Test mail to the session's own address                           |
| `/ntfy/send`, `/ntfy/topic`           | POST, GET | signed in | Test notification to the user's own topic, and that topic        |
| `/rabbitmq/publish`                   | POST      | signed in | Publish a message to the queue                                   |
| `/rabbitmq/consume`                   | GET       | signed in | Queue depth and consumed messages                                |
| `/cache/set`, `/cache/get`            | POST, GET | signed in | Write or read a key under the `demo:` prefix                     |
| `/cnpg/items`                         | GET, POST | signed in | List or add demo items                                           |
| `/cnpg/items/delete`                  | POST      | signed in | Delete one demo item                                             |
| `/features/all`, `/features/evaluate` | GET       | signed in | Evaluate feature flags                                           |
| `/knative/invoke`                     | POST      | signed in | Invoke the serverless Fibonacci service                          |
| `/prometheus/increment`               | POST      | signed in | Increment the demo counter on the answering pod                  |
