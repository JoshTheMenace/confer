# dex-api slow writes: root cause and fixes (last 3 hours)

The slow saves come from `refresh=wait_for` on every write. On Elastic Cloud Serverless, `index.refresh_interval` defaults to 5s, and 5s is also the lowest value you can set ([Elastic docs](https://www.elastic.co/docs/reference/elasticsearch/index-settings/index-modules)). So each `wait_for` write blocks until the next refresh, which can take anywhere from 0 to 5 seconds. In the traces those calls took 75ms–4.74s, about 2.2s on average, and they make up 50–76% of each slow POST. The other slowdown is that every request starts with one or two sequential `profiles/_search` lookups at ~300–450ms each. That's what keeps the read routes at ~0.9–1.9s.

## Slowest routes (17:00–20:00 UTC, dex-api server spans, health probes excluded)

| Route | Requests | Avg | Max |
|---|---|---|---|
| POST /api/consent/:id | 3 | 4.78s | 6.20s |
| POST /api/catch | 11 | 3.74s | 5.60s |
| POST /api/me/signup | 5 | 3.40s | 5.59s |
| GET /api/me | 4 | 1.89s | 3.71s |
| GET /api/sponsor/leads | 4 | 1.70s | 2.40s |
| GET /api/matches | 6 | 0.96s | 1.36s |
| GET /api/consent | 6 | 0.88s | 1.35s |

The spans have no `http.route`, so I grouped routes by `url.path` and rolled the IDs up into `:id`.

## Which Elasticsearch calls take the time

Across all dex-api Elasticsearch HTTP calls, the `wait_for` writes are the slowest kind:

| Call | Count | Avg | Min–max |
|---|---|---|---|
| `POST /consent_requests/_update/{id}?refresh=wait_for` | 6 | 3.95s | 2.54–4.72s |
| `PUT /profiles/_doc/{id}?refresh=wait_for` | 8 | 2.61s | 0.53–4.24s |
| `POST /_bulk?refresh=wait_for` | 31 | 1.81s | 0.08–4.74s |
| Plain writes, no refresh (`vault`, `receipts`, `tags`) | 36 | ~0.5–0.6s | 0.37–1.21s |
| `POST /profiles/_search` | 240 | 0.34s | 0.06–1.40s |
| `_mget` / `GET _doc` | 122 | 0.24–0.26s | — |

The laptop vs. pod comparison is what points at Elasticsearch rather than the cluster's network. Some dex-api traffic comes from a developer laptop (`Joshs-MacBook-Pro.local`), and from there `wait_for` writes averaged 2.37s (max 4.74s). From the pods they averaged 2.15s (max 4.74s). Same cost from both places.

## Example traces

**Consent save, span (traceId: d042000036acf1a61f8c365c410d7f43): 6.20s total.** This one is the "consent inbox takes ~2s+ to save" case.
1. `search profiles`: 1.19s
2. `get consent_requests`: 0.29s
3. `update consent_requests` (`POST /consent_requests/_update/seed-580_…?refresh=wait_for`): 4.72s, 76% of the request

**Catch, span (traceId: de6cf05e184dd911bce2b2f576c6bda4): 5.60s total.**
1. `POST /profiles/_search`: 0.44s
2. `POST /profiles/_search?_source_excludes=tokenHash`: 1.09s
3. `POST /_bulk?refresh=wait_for`: 3.29s
4. Two `_mget` calls in parallel, catches and consent_requests: 0.77s

**Signup, span (traceId: 0eb24853adc8779df703e0a80374f8b3): 5.59s total.**
1. `profiles/_search`: 0.22s
2. `PUT /tags/_doc/1?op_type=create`: 0.75s
3. `PUT /vault/_doc/{id}`: 0.37s
4. `PUT /profiles/_doc/{id}?refresh=wait_for`: 4.24s, 76% of the request

The other POST traces follow the same pattern. Where the `wait_for` write landed just before a refresh, the request was fast (e.g. catch 0.80s with a ~250ms `wait_for`). Where it just missed one, the request ran 5–6s.

## Code-level fixes

No code-host connector is installed and the spans carry no repository attribute, so I haven't read the dex-api source. These fixes come from the request patterns in the traces, not from the code.

**1. Remove `refresh: 'wait_for'` from user-facing writes.** This is the main fix and should cut ~2.2s on average, and up to 4.7s, from every POST. Every read-after-write in these traces goes by ID (`get`, `mget`), and those reads are real-time in Elasticsearch, so they don't need a refresh. Build the response from what you just wrote instead of waiting for it to become searchable:

```ts
// consent: POST /api/consent/:id
const res = await es.update({
  index: 'consent_requests',
  id,
  doc: { status, decidedAt: new Date().toISOString() },
  _source: true,            // return the updated doc
  // refresh: 'wait_for',   // remove — costs 0–5s on Serverless
});
return c.json(res.get?._source);

// signup: POST /api/me/signup
await es.index({ index: 'profiles', id: userId, document: profile /* no refresh */ });
return c.json(profile);

// catch: POST /api/catch
await es.bulk({ operations /* no refresh */ });
const [catches, consents] = await Promise.all([
  es.mget({ index: 'catches', ids: catchIds }),           // real-time, sees the bulk writes
  es.mget({ index: 'consent_requests', ids: consentIds }),
]);
```

If a screen lists recent items with `_search` right after a write (e.g. the consent inbox list), merge the item you just wrote into the client-side list (optimistic update) instead of making the write wait. If a few flows really need search visibility, use `wait_for` only there, or run it in a background job after you've responded. `refresh: true` isn't a fix either: it forces a refresh on every write, which is expensive on Serverless.

**2. Stop running two sequential profile `_search` calls per request.** That's ~0.4–1.5s on every route. Catch and the read routes do one search (presumably the token lookup) and then a second one (`_source_excludes=tokenHash`). Fix it in this order:
- Resolve auth once and reuse it. In Hono, set it in middleware with `c.set('profile', …)` and read it with `c.get('profile')` in the handler instead of searching again.
- Key the token lookup by document ID (e.g. a `tokens` index with `_id = tokenHash` pointing to the profile id), so it's a real-time `GET` (~0.24s avg here) instead of a `_search` (~0.34s avg, up to 1.4s).
- Cache resolved tokens in process for 30–60s with a small LRU.
- Wherever two independent lookups remain, run them with `Promise.all`.

**3. Make `/readyz` stop calling Elasticsearch on every probe.** Each of the 683 probes made a `HEAD /` to Elasticsearch, ~560ms each. That's load on Elasticsearch, and if it slows down, Kubernetes can pull your pods out of rotation. Check Elasticsearch in the background every ~15s and have `/readyz` return the cached result.

**4. Set `http.route` on server spans.** Then routes group as `POST /api/consent/:id` instead of one entry per ID, and per-route p95 alerts become possible. Hono's `routePath(c)` gives you the matched pattern; set it in middleware with `trace.getActiveSpan()?.setAttribute('http.route', routePath(c))` and also update the span name.

A caveat on the evidence: there were only 19 POST requests in the window, and 10 of them came from the laptop. The pattern is the same on the pods (the consent trace above ran on `dex-api-768c7bc4b-dh6rs`, 4.72s in `wait_for`), but re-check the per-route p95s once production traffic grows.

[Open conversation in Dash0](https://app.dash0.com/goto/agent0?thread_id=34ae8c65-6b11-4ce6-9f86-8a423a6e3d24&dataset=default&org=a3fea117-ad47-4fb7-b2bf-47c3213281ac&utm_source=mcp&utm_content=waitForTask&utm_medium=deeplink)

<dash0:model-settings-hint>Agent0 ran on the `advanced` model class at `high` reasoning effort.</dash0:model-settings-hint>
