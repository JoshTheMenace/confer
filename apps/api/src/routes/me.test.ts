import { beforeEach, expect, test, vi } from 'vitest'
import { es } from '../es.js'
import { me } from './me.js'

vi.mock('../es.js', () => ({ es: { search: vi.fn(), index: vi.fn() } }))

const body = { displayName: 'Ana', approach: 'open', interests: [], lookingFor: [], interestsVisibleTo: ['peers'], discoverable: true, contact: {} }
const signup = (extra = {}) => me.request('/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, ...extra }) })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SPONSOR_CODE = 'booth-secret'
  vi.mocked(es.search).mockResolvedValue({ hits: { hits: [{ _source: { tagId: 0 } }] } } as any)
  vi.mocked(es.index).mockResolvedValue({ result: 'created' } as any)
})

test('a badge claimed by a concurrent signup is skipped, so no two people share a tag', async () => {
  // Badge 1 was claimed between our read and our write: the lock answers 'noop' (409 ignored).
  vi.mocked(es.index).mockResolvedValueOnce({ result: 'noop' } as any).mockResolvedValue({ result: 'created' } as any)
  const res = await signup()
  expect((await res.json()).me.tagId).toBe(2)
  expect(vi.mocked(es.index).mock.calls.filter(([r]) => r.index === 'tags').map(([r]) => r.id)).toEqual(['1', '2'])
})

test('a wrong sponsor code is refused instead of silently creating an attendee', async () => {
  expect((await signup({ sponsorCode: 'nope' })).status).toBe(403)
  expect(es.index).not.toHaveBeenCalled()
})

test('the right sponsor code creates a sponsor', async () => {
  vi.mocked(es.index).mockResolvedValue({ result: 'created' } as any)
  expect((await (await signup({ sponsorCode: 'booth-secret' })).json()).me.kind).toBe('sponsor')
})
