import { beforeEach, expect, test, vi } from 'vitest'
import { es } from '../es.js'
import { pulse } from './pulse.js'

vi.mock('../es.js', () => ({ es: { get: vi.fn(), msearch: vi.fn() }, ix: new Proxy({}, { get: (_, name) => `test_${String(name)}` }) }))

type Row = [key: string | number, count: number, shared?: number]
const agg = (...rows: Row[]) => ({ buckets: rows.map(([key, doc_count, shared]) => ({ key, doc_count, shared: { doc_count: shared ?? 0 } })) })
const hits = (value: number) => ({ hits: { total: { value }, hits: [] } })
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000
const responses = (organizer: boolean) => [
  { aggregations: { kinds: agg(['attendee', 40], ['sponsor', 2]), ...(organizer && { attendees: { top: agg(['Tracing', 9]) } }) } },
  { ...hits(12), aggregations: { recent: { perMin: agg([thisMinute(), 3]) }, booths: { byBooth: agg(['b1', 5]) } } },
  { ...hits(6), aggregations: { recent: { perMin: agg([thisMinute(), 1]) } } },
  { ...hits(8), aggregations: { shared: { doc_count: 2 }, byBooth: agg(['b1', 4, 1]) } },
  hits(1),
  { aggregations: { byBooth: agg(['b1', 1]) } },
  { hits: { hits: [{ _id: 'b1', _source: { displayName: 'Dash0' } }, { _id: 'b2', _source: { displayName: 'Elastic' } }] } },
].slice(0, organizer ? 7 : 5)
// Dash0 answers each PromQL query with one sample; which number depends on what was asked.
const dash0 = async (url: string) => {
  const value = url.includes('success_ratio') ? 0.97 : url.includes('slo.target') ? 0.95 : url.includes('ERROR') ? 0.01 : url.includes('duration') ? 420 : 30
  return new Response(JSON.stringify({ data: { result: [{ value: [0, String(value)] }] } }))
}
const get = async (kind: string) => {
  vi.mocked(es.get).mockResolvedValue({ _source: { profile: 'me', kind, tagId: 1 } } as any)
  vi.mocked(es.msearch).mockResolvedValue({ responses: responses(kind === 'organizer') } as any)
  return pulse.request('/', { headers: { authorization: 'Bearer t' } })
}

let clock = Date.parse('2026-11-09T21:00:30Z')
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime((clock += 60_000)) // a minute on: past the 15s health cache
  Object.assign(process.env, { DASH0_API_TOKEN: '', OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer otlp-token,Dash0-Dataset=default' }) // blank in .env: fall back
  vi.stubGlobal('fetch', vi.fn(dash0))
})

test('an attendee gets totals, a 30-minute series and live health, from one Elasticsearch round trip', async () => {
  const body = await (await get('attendee')).json()
  expect(body.totals).toEqual({ attendees: 40, booths: 2, meetings: 12, shares: 6, unshares: 1, requests: 8, shareRate: 0.25 })
  expect(body.series).toHaveLength(30)
  expect(body.series[29]).toEqual({ t: new Date(thisMinute()).toISOString(), scans: 3, shares: 1 })
  expect(body.series[0]).toMatchObject({ scans: 0, shares: 0 })
  expect(body.topInterests).toEqual([])
  expect(body.health).toEqual({ source: 'dash0', p95Ms: 420, errorRate: 0.01, requestsPerMin: 30, slo: { name: 'confer-api-fast', target: 0.95, current: 0.97, ok: true } })
  expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer otlp-token' } })
  expect(es.msearch).toHaveBeenCalledTimes(1)
  const searches = vi.mocked(es.msearch).mock.calls[0][0]!.searches as { index?: string }[]
  expect(searches.filter((_, i) => i % 2 === 0).map((s) => s.index)).toEqual(['test_profiles', 'test_meetings', 'test_shares', 'test_requests', 'test_receipts'])
  expect(JSON.stringify(searches)).not.toContain('interests') // other people's topics are not even asked for
})

test('booth numbers and interest aggregates are for organizers only', async () => {
  expect((await (await get('attendee')).json()).booths).toBeUndefined()
  expect((await (await get('sponsor')).json()).booths).toBeUndefined()
  expect((await (await get('sponsor')).json()).topInterests).toEqual([])
  const body = await (await get('organizer')).json()
  expect(body.booths).toEqual([
    { id: 'b1', name: 'Dash0', scans: 5, requests: 4, shared: 1, shareRate: 0.25, mutes: 1 },
    { id: 'b2', name: 'Elastic', scans: 0, requests: 0, shared: 0, shareRate: 0, mutes: 0 },
  ])
  expect(body.topInterests).toEqual([{ term: 'Tracing', count: 9 }])
})

test('Dash0 being down or slow does not fail the pulse, and is not asked again for 15 seconds', async () => {
  vi.mocked(fetch).mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
  const res = await get('attendee')
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.health).toEqual({ source: 'unavailable' })
  expect(body.totals.meetings).toBe(12)
  vi.mocked(fetch).mockClear()
  await get('attendee')
  expect(fetch).not.toHaveBeenCalled()
})
