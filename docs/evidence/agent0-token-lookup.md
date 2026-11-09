# Dash0 Agent0: why the API SLO was at risk

Asked through the Dash0 MCP server (`runTask`) at 15:23 MST on 2026-11-09, about the service `dex-api`. The question:

> Our SLO confer-api-fast (95% of requests under 2 s) is at risk. Look at the server spans for the /api/* routes and their Elasticsearch child spans. 1) Which routes are slowest at p95? 2) Is there an Elasticsearch call that happens on every single request before the route does its real work, and how many milliseconds does it add per request at p50 and p95? 3) Which Elasticsearch calls inside GET /api/booth run one after another instead of in parallel? 4) What is the smallest code change that would bring the SLO back above 95%?

What we did with it: [incidents.md](../incidents.md) entry 5 and [PR #20](https://github.com/JoshTheMenace/confer/pull/20). Agent0's answer, unedited:

---

The smallest fix is to cache the sign-in token lookup (the `get` span on the `confer_tokens` index). It runs first on 707 of the 720 /api requests and adds 246 ms at p50 and 807 ms at p95. With that time removed, 25 of the 36 slow requests would finish under 2 s, and the 30-minute success rate would go from 95.0% to about 98.5%. All figures are for dex-api, 21:53–22:23 UTC.

## 1) Slowest routes at p95

| Route | Requests | p95 | Over 2 s or error |
|---|---:|---:|---:|
| GET /api/booth/export | 1 | 3.07 s | 1 |
| GET /api/booth | 37 | 2.87 s | 7 |
| GET /api/booth/prospects | 17 | 2.63 s | 3 |
| GET /api/pulse | 109 | 2.23 s | 7 |
| POST /api/scan | 4 | 2.14 s | 1 |
| GET /api/people | 280 | 2.03 s | 15 |

GET /api/booth/export's p95 is one request. By volume, GET /api/people, /api/pulse and /api/booth produce 29 of the 36 bad requests. Every other route stays under 2 s at p95.

## 2) The per-request Elasticsearch call

The `get` on `confer_tokens` is a child of the server span on every /api route except GET /api/config (13 requests). It starts when the request starts. In 80% of cases the route's other Elasticsearch calls only begin after it finishes; in GET /api/booth that held for all 37 requests. Cost per request:

- **p50:** 246 ms
- **p95:** 807 ms
- **Over 1 s:** 5 lookups

There were 746 lookups in the window but only 4 distinct token IDs, so nearly every lookup re-reads a document that was already fetched.

## 3) Sequential calls in GET /api/booth

Averages across all 37 requests, as offsets from the request start. Trace `d0420000a08966f901d6c92f9a0a52d8` (3,339 ms) shows the same chain.

| Stage | Spans | Starts at | Avg duration |
|---|---|---:|---:|
| 1 | `get` on `confer_tokens` | 0 ms | 331 ms |
| 2 | `search` on `confer_meetings`, `confer_shares`, `confer_threads` (these three run in parallel) | 332 ms | 237–271 ms |
| 3 | `mget` | 629 ms | 334 ms |
| 4 | `vault.read`, which wraps its own `mget` and sometimes a `bulk` | 963 ms | 472 ms |

The four stages run strictly one after another; only the three searches overlap. Whether the `mget` or `vault.read` could run alongside the searches depends on whether they need the search results. The spans can't show that, and no source repository is linked to the service, so I couldn't read the code.

## 4) Smallest change

Cache the `confer_tokens` lookup in the process, keyed by token ID, with a short TTL (for example 60 s). Recomputing every request without that lookup's time:

| Scope | Requests | Bad now | Bad with the change | Success rate |
|---|---:|---:|---:|---|
| Last 30 min | 720 | 36 | 11 | 95.0% → 98.5% |
| Since the SLO was created (21:02) | 770 | 36 | 11 | 95.3% → 98.6% |

Since only 4 tokens are in use, the cache would hit on almost every request. That counts as this kind of request authentication normally tolerates. The 11 requests that would still be bad are mostly GET /api/booth. Overlapping its `mget` and `vault.read` with the searches is the next step if more margin is needed.

On the "about 90%" figure: the SLO's evaluated 28-day success ratio is 90.4%. But its own rolling 1-hour series is 3,274 good of 3,436 events (95.3%), and counting raw spans since 20:00 gives 94.7%. My guess, which I haven't verified, is that the SLO has only about 80 minutes of history and estimates the 2 s cut-off by interpolating within a histogram bucket. If so, the 28-day number will move up slowly after the fix rather than right away.
