# Incident log

Real problems we hit while building, and how we found them. Entries 1 to 4 are from the morning: they name routes and services of the first version (`/api/catch`, `/api/consent/:id`), which the current API replaced. Entry 5 is on the current API.

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
- **Fix:** no `wait_for` on user-facing writes. Reads right after a write go by id (real-time `get`/`mget`, never a search), including login, which now resolves a token through a `tokens` doc keyed by its hash. Independent signup writes run in parallel. Readiness is checked in the background. Server spans are named by route.
- **Measured live (laptop → Elastic Serverless):**

| Route | Before (Agent0) | After |
|---|---|---|
| POST /api/consent/:id | 4.78s avg | 1.00s avg |
| POST /api/catch | 3.74s avg | 1.59s avg |
| POST /api/me/signup | 3.40s avg | 1.92s avg |
| GET /api/me right after signup | could miss a brand-new profile | 0.63s, always found |

A plain Serverless write still costs about 0.5s from here, a floor set by network and storage, not by our code.
- **Trade-off (raised by Gitar in review):** lists that are *searches* (the Dex, sponsor counts, the inbox list) now see a new write after the next refresh, within ~5s. The Dex merges the cards you just caught so it never looks empty right after a scan; sponsor counts and new inbox requests lagging a few seconds is acceptable.

## 5. Every request re-checked the sign-in (found with Dash0 Agent0)

- **Symptom:** the SLO `confer-api-fast` (95% of requests under 2 s), which Event Pulse shows on stage, read "at risk".
- **Investigation:** we asked Agent0 which routes were slow and whether one Elasticsearch call ran on every request. Its answer, from 30 minutes of spans (full text: [evidence/agent0-token-lookup.md](evidence/agent0-token-lookup.md)): a `get` on the tokens index ran first on **707 of 720** API requests and added **246 ms at p50 and 807 ms at p95**. There were 746 lookups for only **4 distinct tokens**. Without that time, 25 of the 36 slow requests would finish under 2 s: **95.0% to about 98.5%**.
- **Root cause:** sign-in was a real-time read from Elasticsearch on every request (itself the fix for incident 4, so new accounts work at once). Correct, but repeated for a fact that never changes.
- **Fix:** each API pod remembers who a token belongs to for `AUTH_CACHE_SECONDS` (300 in `k8s/base/api.yaml`; off by default). Unknown tokens are never remembered. [PR #20](https://github.com/JoshTheMenace/confer/pull/20).
- **After:** in a small sample from the venue network (5 to 7 requests each), the median `GET /api/me` went from 0.62 s to 0.25 s and `GET /api/people` from 0.94 s to 0.46 s. `GET /api/booth` is still the slowest route (four Elasticsearch steps one after another); Agent0 named overlapping two of them as the next step, which we did not do.

