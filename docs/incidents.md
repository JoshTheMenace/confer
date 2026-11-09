# Incident log

Real problems we hit while building, and how we found them.

## 1. Pods stuck in ErrImagePull on first deploy (Radar AI investigation)

- **Symptom:** every `dex-api` and `dex-web` pod stuck in `ErrImagePull`; the app never started.
- **Investigation:** `radar diagnose deploy/dex-api -n dex --agent claude` (full output: [evidence/radar-errimagepull.json](evidence/radar-errimagepull.json)).
  Radar found the image had been swapped to a local `dex-api:dev` tag that does not exist on Docker Hub, that the old ghcr image returned 403 with no pull secret, and recommended an explicit `imagePullPolicy: IfNotPresent`.
- **Root cause:** the Deployment was first created with a `:latest` tag, so Kubernetes defaulted `imagePullPolicy` to `Always`. That default stuck when the image changed, so the node kept trying to download an image that only existed locally (loaded with `kind load`).
- **Fix:** explicit `imagePullPolicy: IfNotPresent` on every container, and a `k8s/local` kustomize overlay so local images are used from the first apply.

## 2. API logs never reached Dash0 (found with the Dash0 MCP server)

- **Symptom:** asking the Dash0 MCP server (`getLogRecords`, service `dex-api`) returned *no log records*, while traces and metrics for the same service were arriving.
- **Root cause:** `@opentelemetry/auto-instrumentations-node/register` only hooks CommonJS `require`. Our API is ESM, so `import pino` was never instrumented and no logs were exported.
- **Fix:** `apps/api/src/otel.ts` registers OpenTelemetry's ESM loader hook (`@opentelemetry/instrumentation/hook.mjs`) before starting the SDK; Docker, CronJob and dev scripts now `--import ./dist/otel.js`.
- **Verified:** the same MCP query now returns `dex-api` log records.

## 3. API ignored SIGTERM

- **Symptom:** `kill <pid>` left the API running; found while restarting it during incident 2.
- **Root cause:** the OTel register installs a SIGTERM handler (to flush telemetry), which replaces Node's default exit. In Kubernetes every rollout would wait out the full 30s grace period.
- **Fix:** graceful shutdown in `apps/api/src/index.ts`: close the server, let telemetry flush, exit.

## 4. Saves took 2–6 seconds (found with Dash0 Agent0)

- **Symptom:** the consent inbox took seconds to save; API p95 was about 1.8s.
- **Investigation:** we asked **Agent0** through the Dash0 MCP server (`runTask`) to find the slowest routes and which Elasticsearch calls dominate them. Full report: [evidence/agent0-latency.md](evidence/agent0-latency.md).
- **Root cause (Agent0):** every write used `refresh: 'wait_for'`. On Elastic Serverless the refresh interval is 5s (also the minimum), so each write blocked 0–5s, which was 50–76% of every slow request. Also: two sequential profile searches per request, readiness probes pinging Elasticsearch every time, and server spans without `http.route`.
- **Fix:** no `wait_for` on writes whose follow-up reads use real-time `get`/`mget`, including login, which now resolves a token through a `tokens` doc keyed by its hash. Search-backed lists need immediate visibility, so writes to `catches`, `consent_requests`, and `receipts` use `refresh: 'wait_for'`; other writes remain unblocked. Independent signup writes run in parallel. Readiness is checked in the background. Server spans are named by route.
- **Measured live (laptop → Elastic Serverless):**

| Route | Before (Agent0) | After |
|---|---|---|
| POST /api/consent/:id | 4.78s avg | 1.00s avg |
| POST /api/catch | 3.74s avg | 1.59s avg |
| POST /api/me/signup | 3.40s avg | 1.92s avg |
| GET /api/me right after signup | could miss a brand-new profile | 0.63s, always found |

A plain Serverless write still costs about 0.5s from here, a floor set by network and storage, not by our code.
