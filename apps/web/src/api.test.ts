import { expect, test } from 'vitest'
import { buildPath } from './api'
import { createMock } from './mock/server'
import { silhouetteSvg } from './Silhouette'

test('buildPath fills params, encodes them and adds the query', () => {
  expect(buildPath('POST /api/people/:id/share', { id: 'p 1' })).toBe('/api/people/p%201/share')
  expect(buildPath('GET /api/discover', {}, { q: 'stuck on tracing', empty: undefined })).toBe('/api/discover?q=stuck+on+tracing')
  expect(() => buildPath('GET /api/people/:id')).toThrow(/Missing "id"/)
})

test('a scan lands in both lists with the same three things in common, one related', () => {
  const { call } = createMock()
  const [diego] = call('demo-500', 'POST /api/scan', { body: { tagIds: [501], source: 'manual' } }).cards
  expect(diego.common).toHaveLength(3)
  expect(diego.common).toContainEqual({ kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' })
  expect(diego.theyShared).toBeUndefined()
  const amara = call('demo-501', 'GET /api/people').people.find((p) => p.id === 'p500')!
  expect(amara.met?.by).toBe('them')
  expect(amara.common).toContainEqual({ kind: 'related', mine: 'Distributed tracing', theirs: 'OpenTelemetry' })
})

test('share shows the photo and chosen fields to the other person; unshare takes them back with a receipt', () => {
  const { call } = createMock()
  call('demo-500', 'POST /api/scan', { body: { tagIds: [501], source: 'manual' } })
  call('demo-501', 'POST /api/people/:id/share', { params: { id: 'p500' }, body: { fields: ['email'] } })
  const seen = () => call('demo-500', 'GET /api/people').people.find((p) => p.id === 'p501')!
  expect(seen().theyShared).toMatchObject({ fields: ['email'], contact: { email: 'diego@example.dev' } })
  expect(seen().theyShared?.photo).toMatch(/^data:image/)
  const { receipt } = call('demo-501', 'DELETE /api/people/:id/share', { params: { id: 'p500' } })
  expect(receipt).toMatchObject({ type: 'unshared', fields: ['email'] })
  expect(seen().theyShared).toBeUndefined()
})

test('a booth request reaches the inbox without a name leaking, and a yes becomes a lead', () => {
  const { call } = createMock()
  const [visitor] = call('demo-580', 'POST /api/scan', { body: { tagIds: [500], source: 'manual' } }).cards
  expect(visitor.name).toBeNull()
  call('demo-580', 'POST /api/booth/requests', { body: { to: ['p500'], note: 'Hello' } })
  const request = call('demo-500', 'GET /api/inbox').requests.find((r) => r.note === 'Hello')!
  call('demo-500', 'POST /api/inbox/:id', { params: { id: request.id }, body: { action: 'share' } })
  expect(call('demo-580', 'GET /api/booth').leads.find((l) => l.card.id === 'p500')).toMatchObject({ via: 'request', note: 'Hello', card: { name: 'Amara' } })
})

test('silhouettes are the same every time and differ between people', () => {
  expect(silhouetteSvg('p500')).toBe(silhouetteSvg('p500'))
  expect(new Set(['p500', 'p501', 'p502', 'p503'].map(silhouetteSvg)).size).toBe(4)
})
