import { Hono } from 'hono'
import { auth, type Me } from '../auth.js'
import type { Api, Kind, Pulse } from '../contract.js'
import { es, ix } from '../es.js'
import { log, span } from '../telemetry.js'

const MINUTE = 60_000
type Buckets = { buckets: { key: string | number; doc_count: number; shared?: { doc_count: number } }[] }
type Res = {
  hits?: { total?: { value: number }; hits: { _id: string; _source: { displayName: string } }[] }
  aggregations?: { kinds?: Buckets; attendees?: { top: Buckets }; recent?: { perMin: Buckets }; booths?: { byBooth: Buckets }; shared?: { doc_count: number }; byBooth?: Buckets }
}

/** Every product number on the pulse as ONE msearch: a Serverless round trip costs 0.3 to 0.7s, so five would be seconds. */
function pulseSearches(since: number, organizer: boolean) {
  const count = { size: 0, track_total_hits: true }
  const perMin = { recent: { filter: { range: { at: { gte: since } } }, aggs: { perMin: { date_histogram: { field: 'at', fixed_interval: '1m' } } } } }
  const byBooth = (field: string, aggs = {}) => (organizer ? { byBooth: { terms: { field, size: 100 }, aggs } } : {})
  const shared = { shared: { filter: { term: { status: 'shared' } } } }
  return [
    // Topic counts are for organizers only: an attendee could diff them between two polls to learn a newcomer's tags.
    { index: ix.profiles }, { size: 0, aggs: { kinds: { terms: { field: 'kind' } }, ...(organizer && { attendees: { filter: { term: { kind: 'attendee' } }, aggs: { top: { terms: { field: 'interests', size: 8 } } } } }) } },
    { index: ix.meetings }, { ...count, aggs: { ...perMin, booths: { filter: { term: { kind: 'booth' } }, aggs: byBooth('scanner') } } },
    { index: ix.shares }, { ...count, aggs: perMin },
    { index: ix.requests }, { ...count, aggs: { ...shared, ...byBooth('booth', shared) } },
    { index: ix.receipts }, { ...count, query: { term: { type: 'unshared' } } },
    ...(organizer ? [{ index: ix.mutes }, { size: 0, aggs: byBooth('booth') }, { index: ix.profiles }, { size: 100, _source: ['displayName'], query: { term: { kind: 'sponsor' } } }] : []),
  ]
}

const api = 'service_name="dex-api", otel_span_kind="SERVER", http_route=~"/api/.*"' // real API routes, not probes
const slo = 'confer-api-fast' // defined in observability/slo.json; Dash0 records its state as metrics
const healthQueries = [
  `histogram_quantile(0.95, sum(rate({otel_metric_name="dash0.spans.duration", ${api}}[5m]))) * 1000`,
  `(sum(rate({otel_metric_name="dash0.spans", ${api}, otel_span_status_code="ERROR"}[5m])) or vector(0)) / sum(rate({otel_metric_name="dash0.spans", ${api}}[5m]))`,
  `sum(rate({otel_metric_name="dash0.spans", ${api}}[5m])) * 60`,
  `last_over_time({otel_metric_name="dash0.slo.success_ratio", slo="${slo}"}[30m])`,
  `last_over_time({otel_metric_name="dash0.slo.target", slo="${slo}"}[30m])`,
]

async function readHealth(): Promise<Pulse['health']> {
  // `||`, not `??`: a line left blank in .env arrives as an empty string.
  const env = process.env, url = env.DASH0_API_URL || 'https://api.us-west-2.aws.dash0.com', dataset = env.DASH0_DATASET || 'default', dashboardUrl = env.DASH0_DASHBOARD_URL || undefined
  const token = env.DASH0_API_TOKEN || /Bearer ([^,\s]+)/.exec(env.OTEL_EXPORTER_OTLP_HEADERS ?? '')?.[1]
  const ask = async (query: string) => {
    const res = await fetch(`${url}/api/prometheus/api/v1/query?${new URLSearchParams({ query, dataset })}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000) })
    if (!res.ok) throw new Error(`dash0 answered ${res.status}`)
    const value = Number((await res.json()).data.result[0]?.value[1])
    return Number.isFinite(value) ? value : undefined // no traffic in the window: no series, or NaN
  }
  try {
    const [p95Ms, errorRate, requestsPerMin, current, target] = await Promise.all(healthQueries.map(ask))
    return { source: 'dash0', p95Ms, errorRate, requestsPerMin, slo: current !== undefined && target !== undefined ? { name: slo, target, current, ok: current >= target } : undefined, dashboardUrl }
  } catch (err) {
    log.warn({ err: String(err) }, 'dash0 health unavailable')
    return { source: 'unavailable', dashboardUrl }
  }
}

// The pulse is polled; Dash0 is asked at most once per 15s, and callers that arrive together share one answer.
let cached: { until: number; health: Promise<Pulse['health']> } | undefined
const health = () => (cached && cached.until > Date.now() ? cached : (cached = { until: Date.now() + 15_000, health: span('pulse.health', {}, readHealth) })).health

export const pulse = new Hono<{ Variables: { me: Me } }>().use(auth).get('/', async (c) => {
  const organizer = (c.var.me.kind as Kind) === 'organizer' // auth's Me predates organizers
  const start = Math.floor(Date.now() / MINUTE) * MINUTE - 29 * MINUTE
  const [{ responses }, dash0] = await Promise.all([es.msearch({ searches: pulseSearches(start, organizer) }), health()])
  const [profiles, meetings, shares, requests, unshares, mutes, boothProfiles] = responses as Res[]
  const total = (r: Res) => r.hits?.total?.value ?? 0
  const counts = (a?: Buckets) => new Map(a?.buckets.map((b) => [b.key, b.doc_count]))
  const rate = (part = 0, all = 0) => (all ? part / all : 0)
  const kinds = counts(profiles.aggregations?.kinds)
  const scansAt = counts(meetings.aggregations?.recent?.perMin), sharesAt = counts(shares.aggregations?.recent?.perMin)
  const scansBy = counts(meetings.aggregations?.booths?.byBooth), mutesBy = counts(mutes?.aggregations?.byBooth)
  const requestsBy = new Map(requests.aggregations?.byBooth?.buckets.map((b) => [b.key, b]))
  return c.json({
    at: new Date().toISOString(),
    totals: {
      attendees: kinds.get('attendee') ?? 0, booths: kinds.get('sponsor') ?? 0, meetings: total(meetings), shares: total(shares), unshares: total(unshares),
      requests: total(requests), shareRate: rate(requests.aggregations?.shared?.doc_count, total(requests)),
    },
    series: Array.from({ length: 30 }, (_, i) => start + i * MINUTE).map((t) => ({ t: new Date(t).toISOString(), scans: scansAt.get(t) ?? 0, shares: sharesAt.get(t) ?? 0 })),
    topInterests: organizer ? (profiles.aggregations?.attendees?.top.buckets ?? []).map((b) => ({ term: String(b.key), count: b.doc_count })) : [],
    // Counts per booth only: nothing here says who scanned, shared or muted.
    ...(organizer && {
      booths: (boothProfiles.hits?.hits ?? []).map(({ _id, _source }) => {
        const r = requestsBy.get(_id)
        return { id: _id, name: _source.displayName, scans: scansBy.get(_id) ?? 0, requests: r?.doc_count ?? 0, shared: r?.shared?.doc_count ?? 0, shareRate: rate(r?.shared?.doc_count, r?.doc_count), mutes: mutesBy.get(_id) ?? 0 }
      }),
    }),
    health: dash0,
  } satisfies Api['GET /api/pulse']['res'])
})
