import { expect, test } from 'vitest'
import { createMock } from './server'

const amara = 'demo-500', diego = 'demo-501', elastic = 'demo-580'
const find = (api: ReturnType<typeof createMock>, token: string, id: string) => api(token, 'GET /api/people').people.find((p) => p.id === id)

test('a scan lands in both lists with three things in common, one related', () => {
  const api = createMock()
  expect(find(api, amara, 'diego')).toBeUndefined()
  const [card] = api(amara, 'POST /api/scan', { body: { tagIds: [501], source: 'manual' } }).cards
  expect(card.common.map((c) => c.kind).sort()).toEqual(['related', 'same', 'same'])
  expect(card.common.find((c) => c.kind === 'related')).toMatchObject({ mine: 'OpenTelemetry', theirs: 'Distributed tracing' })
  expect(card.theyShared).toBeUndefined()
  expect(find(api, diego, 'amara')?.met?.by).toBe('them')
})

test('share reveals the photo to the other person; unshare takes it back with a receipt', () => {
  const api = createMock('met')
  api(diego, 'POST /api/people/:id/share', { params: { id: 'amara' }, body: { fields: ['email'] } })
  const seen = find(api, amara, 'diego')?.theyShared
  expect(seen?.photo).toMatch(/^data:image/)
  expect(seen?.contact).toEqual({ email: 'diego@example.com' })
  const { receipt } = api(diego, 'DELETE /api/people/:id/share', { params: { id: 'amara' } })
  expect(receipt).toMatchObject({ type: 'unshared', fields: ['email'] })
  expect(find(api, amara, 'diego')?.theyShared).toBeUndefined()
})

test('a booth sees no name; its request reaches the inbox, and a yes becomes a lead', () => {
  const api = createMock()
  const [visitor] = api(elastic, 'POST /api/scan', { body: { tagIds: [501], source: 'camera' } }).cards
  expect(visitor.name).toBeNull()
  api(elastic, 'POST /api/booth/requests', { body: { to: ['diego'], note: 'Hello' } })
  const request = api(diego, 'GET /api/inbox').requests.find((r) => r.booth.id === 'elastic')!
  const before = api(elastic, 'GET /api/booth').leads.length
  api(diego, 'POST /api/inbox/:id', { params: { id: request.id }, body: { action: 'share' } })
  const { leads } = api(elastic, 'GET /api/booth')
  expect(leads.length).toBe(before + 1)
  expect(leads.find((l) => l.card.id === 'diego')).toMatchObject({ via: 'request', note: 'Hello' })
})
