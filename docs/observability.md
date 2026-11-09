# Observability

Confer is watched with [Dash0](https://www.dash0.com). Think of it as the app's flight recorder: every request, log line and counter is sent there, and the app reads some of it back to show its own health.

## What is instrumented

| Signal | Where it comes from | What you can answer |
|---|---|---|
| **Traces** | OpenTelemetry auto-instrumentation in `dex-api` (`apps/api/src/otel.ts`). Server spans are named by route (`POST /api/scan`), Elasticsearch calls are child spans. (OpenLIT is initialized for LLM calls but idle: Confer makes none today.) | Which route is slow, and which Elasticsearch call inside it? |
| **Business spans** | `span('consent.share', …)` in `apps/api/src/telemetry.ts` wraps one product step. | A trace reads like the product: scan, share, unshare. |
| **Logs** | `pino`, exported over OTLP with the trace id attached. | What did the API say during this exact request? |
| **Metrics** | Product counters `confer.scans`, `confer.shares`, `confer.unshares`, `confer.requests`, `confer.vault.reads`, plus HTTP and runtime metrics. | Is the product being used, and how? |
| **RUM** | The Dash0 web SDK in `dex-web`: page views, web vitals, browser errors, and the trace header that joins a tap to its API trace. | Is it fast on a real phone? |

No telemetry carries a name, email, handle, photo or free text: ids, kinds and counts only (`.gitar/review/privacy.md`).

## Observability is part of the product

Two features only exist because the telemetry does:

1. **Event Pulse reads its health from Dash0.** `GET /api/pulse` (`apps/api/src/routes/pulse.ts`) answers two questions at once. *Is the event alive?* comes from Elasticsearch: totals and a per-minute chart, plus top interests and per-booth numbers for organizers only, all in one `msearch` round trip. *Is the app healthy?* comes live from Dash0 with PromQL: p95 latency, error rate, requests per minute and the SLO state for `dex-api`. The app asks its own monitoring how it is doing, the way a pilot reads the instruments instead of guessing. Dash0 is asked at most once per 15 seconds with a 2 second timeout; if it does not answer, the pulse still loads and says `health.source: "unavailable"`.
2. **Every "who saw my data" receipt carries a trace id.** When a card is shared, opened or unshared, the receipt stores the id of the trace that did it (`traceId()` in `telemetry.ts`). A privacy claim in the inbox is backed by a recording in Dash0, not just a database row.

## Dashboard, SLO and check rule, as code

They live in [`observability/`](../observability) and are applied with one command:

```sh
pnpm obs:apply   # reads DASH0_API_URL, DASH0_API_TOKEN (or the OTLP bearer token) and DASH0_DATASET from .env
```

Each one is sent with `PUT` under a fixed id, so running it again updates in place instead of making a copy. It prints the `DASH0_DASHBOARD_URL` line to put in `.env`; the pulse returns it as `health.dashboardUrl`. The token needs Dash0's "All permissions" option (an ingest-only token gets a 403).

| File | What it creates |
|---|---|
| `dashboard.mjs` | **Confer: event health.** Requests per minute and p95 latency by route (`http.route`), error rate, Elasticsearch latency by operation, the SLO and its burn rate, product metrics (scans, shares and unshares, booth requests, sealed envelope reads), and web vitals, page views and browser errors from `dex-web` RUM. One short row per panel. |
| `slo.json` | **Confer API: fast and successful** (`confer-api-fast`), an OpenSLO document: 95% of `/api` requests succeed in under 2 seconds over a rolling 28 days. A failed request counts as bad however fast it was. |
| `check-rule.json` | **Confer API is burning its error budget.** Fires when the SLO's fast or slow burn rate goes above 1 (degraded) or 2 (critical). |

Why 2 seconds and 95%: a write to Elasticsearch Serverless costs about 0.5s from here no matter what our code does ([incident 4](incidents.md#4-saves-took-26-seconds-found-with-dash0-agent0)), and a scan or signup does two or three of them. A target the service has never met is an alarm everyone learns to ignore, so the target sits just above what we measured. An error budget works like a monthly allowance: 5 in 100 requests may be slow or fail, and the burn rate says how fast the allowance is being spent (1 means it runs out exactly at the end of the window).

Some panels start empty: the `confer.*` counters only move once people scan and share, and Dash0 needs a few minutes of traffic before a new SLO shows a value.

## Found with Dash0's AI tools

All three are written up in [incidents.md](incidents.md):

- [Incident 2: API logs never reached Dash0](incidents.md#2-api-logs-never-reached-dash0-found-with-the-dash0-mcp-server), found by asking the Dash0 MCP server for `dex-api` logs and getting none.
- [Incident 4: saves took 2 to 6 seconds](incidents.md#4-saves-took-26-seconds-found-with-dash0-agent0), root-caused by Agent0 (consent save 4.8s to 1.0s). Full report: [evidence/agent0-latency.md](evidence/agent0-latency.md).
- [Incident 5: every request re-checked the sign-in](incidents.md#5-every-request-re-checked-the-sign-in-found-with-dash0-agent0), found by Agent0 on the current API (707 of 720 requests; p50 791 ms to 344 ms on the three most-polled routes after the fix). Agent0's answer: [evidence/agent0-token-lookup.md](evidence/agent0-token-lookup.md).
