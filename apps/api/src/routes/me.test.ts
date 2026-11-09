import { beforeEach, expect, test, vi } from 'vitest'
import { es } from '../es.js'
import { me } from './me.js'

vi.mock('../es.js', () => ({ es: { search: vi.fn(), index: vi.fn(), get: vi.fn(), update: vi.fn(), mget: vi.fn() }, ix: new Proxy({}, { get: (_, name) => name }) }))
vi.mock('../common.js', () => ({ embed: vi.fn(async () => {}) }))

const body = {
  displayName: 'Ana', approach: 'open', interests: ['Go', 'Rust', 'eBPF'], lookingFor: [], discoverable: true,
  openToBooths: true, boothsSeeName: false, autoShare: 'off', shareFields: ['email'], contact: { email: 'ana@example.com' },
}
const send = (method: string, path: string, json: object) =>
  me.request(path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify(json) })
const signup = (extra = {}) => send('POST', '/signup', { ...body, ...extra })
const stored = (interestEdits: number) =>
  vi.mocked(es.get).mockImplementation((async ({ index }: { index: string }) =>
    ({ _source: index === 'tokens' ? { profile: 'p1', kind: 'attendee', tagId: 1 } : { ...body, interestEdits } })) as any)
const written = (index: string) => vi.mocked(es.index).mock.calls.map(([r]) => r).find((r) => r.index === index)?.document as any

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SPONSOR_CODE = 'booth-secret'
  process.env.ORGANIZER_CODE = 'organizer-secret'
  vi.mocked(es.search).mockResolvedValue({ hits: { hits: [{ _source: { tagId: 0 } }] } } as any)
  vi.mocked(es.index).mockResolvedValue({ result: 'created' } as any)
  vi.mocked(es.update).mockResolvedValue({} as any)
  vi.mocked(es.mget).mockResolvedValue({ docs: [{ found: true, _source: { email: 'ana@example.com' } }] } as any)
})

test('a badge claimed by a concurrent signup is skipped, so no two people share a tag', async () => {
  // Badge 1 was claimed between our read and our write: the lock answers 'noop' (409 ignored).
  vi.mocked(es.index).mockResolvedValueOnce({ result: 'noop' } as any).mockResolvedValue({ result: 'created' } as any)
  expect((await (await signup()).json()).me.tagId).toBe(2)
  expect(vi.mocked(es.index).mock.calls.filter(([r]) => r.index === 'tags').map(([r]) => r.id)).toEqual(['1', '2'])
})

test('a wrong code is refused instead of silently creating an attendee', async () => {
  expect((await signup({ code: 'nope' })).status).toBe(403)
  expect(es.index).not.toHaveBeenCalled()
})

test('the sponsor and organizer codes set the kind; no code is an attendee', async () => {
  expect((await (await signup({ code: 'booth-secret', interests: ['Search'] })).json()).me.kind).toBe('sponsor')
  expect((await (await signup({ code: 'organizer-secret', interests: [] })).json()).me.kind).toBe('organizer')
  expect((await (await signup()).json()).me.kind).toBe('attendee')
})

test('attendees need 3 to 8 interests', async () => {
  expect((await signup({ interests: ['Go', 'Rust'] })).status).toBe(400)
  expect((await signup({ interests: Array.from({ length: 9 }, (_, i) => `tag ${i}`) })).status).toBe(400)
  expect(es.index).not.toHaveBeenCalled()
})

test('a photo must be a small JPEG, PNG, WebP or SVG data URL, and lives in the vault only', async () => {
  expect((await signup({ photo: 'data:image/gif;base64,AAAA' })).status).toBe(400)
  expect((await signup({ photo: 'https://example.com/me.png' })).status).toBe(400)
  expect((await signup({ photo: `data:image/png;base64,${'A'.repeat(151 * 1024)}` })).status).toBe(400)
  const photo = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>'
  const res = await (await signup({ photo })).json()
  expect(res.me).toMatchObject({ hasPhoto: true, photo, starred: [] })
  expect(written('vault')).toEqual({ email: 'ana@example.com', photo })
  expect(written('profiles')).toMatchObject({ hasPhoto: true, interestEdits: 0 })
  expect(written('profiles')).not.toHaveProperty('photo')
  expect(JSON.stringify(res)).not.toContain('tokenHash')
})

test('interests can be changed 5 times, then a 409 explains why', async () => {
  stored(4)
  expect((await send('PATCH', '/', { interests: ['Go', 'Rust', 'Cilium'] })).status).toBe(200)
  expect(vi.mocked(es.update).mock.calls[0][0]).toMatchObject({ index: 'profiles', doc: { interests: ['Go', 'Rust', 'Cilium'], interestEdits: 5 } })
  vi.mocked(es.update).mockClear()
  stored(5)
  const res = await send('PATCH', '/', { interests: ['Go', 'Rust', 'Falco'] })
  expect(res.status).toBe(409)
  expect((await res.json()).error).toMatch(/5 times/)
  expect(es.update).not.toHaveBeenCalled()
})

test('two interest edits at once: the write is conditional, and the loser gets a 409 instead of an extra edit', async () => {
  stored(4)
  vi.mocked(es.get).mockImplementation((async ({ index }: { index: string }) =>
    ({ _seq_no: 7, _primary_term: 1, _source: index === 'tokens' ? { profile: 'p1', kind: 'attendee', tagId: 1 } : { ...body, interestEdits: 4 } })) as any)
  vi.mocked(es.update).mockRejectedValue({ statusCode: 409 })
  expect((await send('PATCH', '/', { interests: ['Go', 'Rust', 'Cilium'] })).status).toBe(409)
  expect(vi.mocked(es.update).mock.calls[0][0]).toMatchObject({ index: 'profiles', if_seq_no: 7, if_primary_term: 1 })
})

test('saving the same interests, or other fields, does not use up an edit', async () => {
  stored(5)
  expect((await send('PATCH', '/', { interests: body.interests, about: 'new' })).status).toBe(200)
  expect(vi.mocked(es.update).mock.calls[0][0].doc).toEqual({ interests: body.interests, about: 'new' })
})

test("photo '' removes the photo", async () => {
  stored(0)
  await send('PATCH', '/', { photo: '' })
  const docs = Object.fromEntries(vi.mocked(es.update).mock.calls.map(([r]) => [r.index, r.doc]))
  expect(docs).toEqual({ vault: { photo: null }, profiles: { hasPhoto: false } })
})
