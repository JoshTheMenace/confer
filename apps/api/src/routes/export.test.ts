import { beforeEach, expect, test, vi } from 'vitest'
import { es } from '../es.js'
import { canI } from '../k8s.js'
import { boothExport, cell } from './export.js'

vi.mock('../es.js', () => ({ es: { get: vi.fn(), search: vi.fn(), mget: vi.fn(), bulk: vi.fn() }, ix: new Proxy({}, { get: (_, name) => name }) }))
vi.mock('../k8s.js', async (original) => ({ ...(await original<typeof import('../k8s.js')>()), canI: vi.fn(), kubernetes: vi.fn(() => true) }))

const at = '2026-11-09T11:00:00.000Z'
const person = (displayName: string) => ({ kind: 'attendee', tagId: 1, displayName, role: 'SRE', approach: 'open', interests: [], boothsSeeName: false })
const docs: Record<string, object> = {
  'profiles/acme': { kind: 'sponsor', tagId: 9, displayName: 'Acme', approach: 'open', interests: [] },
  'profiles/ana': person('Ana'), 'profiles/ben': person('=Ben'), 'profiles/cy': person('Cy'),
  'shares/ana_acme': { from: 'ana', to: 'acme', fields: ['email'], via: 'request', note: 'Come, see "the" demo', at },
  'shares/ben_acme': { from: 'ben', to: 'acme', fields: ['email', 'github'], via: 'manual', at },
  // cy unshared a second ago: search still lists the share, the read by id does not.
  'meetings/acme_ana': { scanner: 'acme', scanned: 'ana', at, common: [{ kind: 'same', mine: 'Go', theirs: 'Go' }, { kind: 'related', mine: 'Tracing', theirs: 'OpenTelemetry' }] },
  'vault/ana': { email: 'ana@example.com', linkedin: 'in/ana', github: 'ana', photo: 'data:image/png;base64,AAAA' },
  'vault/ben': { email: 'ben@example.com', github: '@ben' },
  'vault/cy': { email: 'cy@example.com' },
}
const get = (path: string, kind = 'sponsor') => {
  vi.mocked(es.get).mockResolvedValue({ _source: { profile: 'acme', kind, tagId: 9 } } as any)
  return boothExport.request(path, { headers: { authorization: 'Bearer t' } })
}
const receipts = () => vi.mocked(es.bulk).mock.calls.flatMap(([r]) => r.operations as any[]).filter((o) => o.type)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(es.search).mockResolvedValue({ hits: { hits: ['ana', 'ben', 'cy'].map((from) => ({ _source: { from } })) } } as any)
  vi.mocked(es.mget).mockImplementation((async ({ docs: refs }: { docs: { _index: string; _id: string }[] }) =>
    ({ docs: refs.map((r) => ({ found: `${r._index}/${r._id}` in docs, _source: docs[`${r._index}/${r._id}`] })) })) as any)
  vi.mocked(es.bulk).mockResolvedValue({ items: [] } as any)
  vi.mocked(canI).mockResolvedValue('allowed')
})

test('sponsors only', async () => {
  for (const path of ['/export', '/grants']) expect((await get(path, 'attendee')).status).toBe(403)
  expect(es.mget).not.toHaveBeenCalled()
  expect((await boothExport.request('/export')).status).toBe(401)
})

test('one row per current share, with only the shared fields, and a receipt for each', async () => {
  const res = await get('/export')
  expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="confer-leads-\d{4}-\d\d-\d\d\.csv"$/)
  expect(Object.fromEntries(['x-confer-gate', 'x-confer-exported', 'x-confer-denied'].map((h) => [h, res.headers.get(h)])))
    .toEqual({ 'x-confer-gate': 'kubernetes', 'x-confer-exported': '2', 'x-confer-denied': '0' })
  const csv = await res.text()
  expect(csv.trimEnd().split('\r\n')).toEqual([
    'name,role,email,linkedin,github,shared_at,how,note,in_common,allowed_uses',
    `Ana,SRE,ana@example.com,,,${at},request,"Come, see ""the"" demo",Go; OpenTelemetry (related to Tracing),read-email export`,
    `'=Ben,SRE,ben@example.com,,'@ben,${at},manual,,,read-email read-github export`,
  ])
  // Not shared, or no longer shared: never in the file.
  for (const secret of ['in/ana', 'data:image', 'cy@example.com', 'Cy']) expect(csv).not.toContain(secret)
  expect(receipts().filter((r) => r.type === 'exported')).toEqual([
    expect.objectContaining({ owner: 'ana', who: 'acme', fields: ['email'] }), expect.objectContaining({ owner: 'ben', who: 'acme', fields: ['email', 'github'] }),
  ])
  expect(receipts().filter((r) => r.type === 'opened').map((r) => r.owner)).toEqual(['ana', 'ben'])
})

test('a row Kubernetes denies is dropped and counted, and its vault is never opened', async () => {
  vi.mocked(canI).mockImplementation(async (_booth, _verb, attendee) => (attendee === 'ana' ? 'denied' : 'allowed'))
  const res = await get('/export'), csv = await res.text()
  expect([res.headers.get('x-confer-gate'), res.headers.get('x-confer-exported'), res.headers.get('x-confer-denied')]).toEqual(['kubernetes', '1', '1'])
  expect(csv).not.toContain('ana@example.com')
  expect(vi.mocked(es.mget).mock.calls.flatMap(([r]) => (r as any).docs).filter((d) => d._index === 'vault').map((d) => d._id)).toEqual(['ben'])
  expect(receipts().map((r) => r.owner)).not.toContain('ana')
  expect(canI).toHaveBeenCalledWith('acme', 'export', 'ana')
})

test('when Kubernetes cannot be asked, the share alone decides and the header says so', async () => {
  vi.mocked(canI).mockResolvedValue('unavailable')
  const res = await get('/export')
  expect([res.headers.get('x-confer-gate'), res.headers.get('x-confer-exported'), res.headers.get('x-confer-denied')]).toEqual(['elasticsearch-only', '2', '0'])
})

test('cells are quoted when needed and can never start a formula', () => {
  expect(['plain', 'a,b', 'say "hi"', 'two\nlines', undefined, null].map(cell)).toEqual(['plain', '"a,b"', '"say ""hi"""', '"two\nlines"', '', ''])
  expect(['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("x","y")'].map(cell)).toEqual(["'=1+1", "'+1", "'-1", "'@SUM(A1)", `"'=HYPERLINK(""x"",""y"")"`])
})

test('grants: each current lead as Kubernetes sees it', async () => {
  vi.mocked(canI).mockImplementation(async (_booth, _verb, attendee) => (attendee === 'ana' ? 'allowed' : 'denied'))
  expect(await (await get('/grants')).json()).toEqual({
    grants: [
      { attendeeId: 'ana', namespace: 'booth-acme', binding: 'contact-ana', verbs: ['read-email', 'export'], kubernetes: 'allowed' },
      { attendeeId: 'ben', namespace: 'booth-acme', binding: 'contact-ben', verbs: ['read-email', 'read-github', 'export'], kubernetes: 'denied' },
    ],
  })
  expect(vi.mocked(es.mget).mock.calls.flatMap(([r]) => (r as any).docs).some((d) => d._index === 'vault')).toBe(false)
})
