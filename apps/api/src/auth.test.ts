import { Hono } from 'hono'
import { beforeEach, expect, test, vi } from 'vitest'
import { auth, hashToken } from './auth.js'
import { es } from './es.js'

vi.mock('./es.js', () => ({ es: { get: vi.fn(), search: vi.fn(), index: vi.fn() }, ix: new Proxy({}, { get: (_, name) => name }) }))

const app = new Hono<{ Variables: { me: unknown } }>().use(auth).get('/', (c) => c.json(c.var.me))
const call = (token?: string) => app.request('/', { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => vi.clearAllMocks())

test('a token resolves with one real-time GET, so a brand-new account works without waiting for a refresh', async () => {
  vi.mocked(es.get).mockResolvedValue({ _source: { profile: 'p1', kind: 'attendee', tagId: 3 } } as any)
  expect(await (await call('t')).json()).toEqual({ id: 'p1', kind: 'attendee', tagId: 3 })
  expect(vi.mocked(es.get).mock.calls[0][0]).toMatchObject({ index: 'tokens', id: hashToken('t') })
  expect(es.search).not.toHaveBeenCalled()
})

test('accounts from before the tokens index are found once by search, then linked', async () => {
  vi.mocked(es.get).mockResolvedValue({ found: false } as any)
  vi.mocked(es.search).mockResolvedValue({ hits: { hits: [{ _id: 'p2', _source: { kind: 'sponsor', tagId: 580 } }] } } as any)
  expect(await (await call('old')).json()).toEqual({ id: 'p2', kind: 'sponsor', tagId: 580 })
  expect(vi.mocked(es.index).mock.calls[0][0]).toMatchObject({ index: 'tokens', id: hashToken('old'), document: { profile: 'p2' } })
})

test('unknown or missing tokens are refused', async () => {
  vi.mocked(es.get).mockResolvedValue({ found: false } as any)
  vi.mocked(es.search).mockResolvedValue({ hits: { hits: [] } } as any)
  expect((await call('nope')).status).toBe(401)
  expect((await call()).status).toBe(401)
})

test('with AUTH_CACHE_SECONDS set, a known token is remembered: the second request does not ask Elasticsearch again', async () => {
  vi.stubEnv('AUTH_CACHE_SECONDS', '60')
  vi.mocked(es.get).mockResolvedValue({ _source: { profile: 'p3', kind: 'attendee', tagId: 7 } } as any)
  await call('again')
  expect(await (await call('again')).json()).toEqual({ id: 'p3', kind: 'attendee', tagId: 7 })
  expect(es.get).toHaveBeenCalledTimes(1)
  vi.unstubAllEnvs()
})
