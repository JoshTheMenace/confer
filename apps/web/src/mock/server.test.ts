import { expect, test } from 'vitest'
import { createServer } from './server'

const amara = 'demo-500', diego = 'demo-501', booth = 'demo-580'

test('a scan lands in both lists with three things in common, one related', async () => {
  const { handle } = createServer()
  expect((await handle(amara, 'GET /api/people')).people.some((p) => p.id === 'p501')).toBe(false)
  const { cards } = await handle(amara, 'POST /api/scan', { body: { tagIds: [501], source: 'manual' } })
  expect(cards[0].common).toHaveLength(3)
  expect(cards[0].common).toContainEqual({ kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' })
  expect(cards[0].theyShared).toBeUndefined()
  const hers = (await handle(diego, 'GET /api/people')).people.find((p) => p.id === 'p500')!
  expect(hers.met?.by).toBe('them')
  expect(hers.common).toContainEqual({ kind: 'related', mine: 'Distributed tracing', theirs: 'OpenTelemetry' })
})

test('share shows the chosen fields and photo to the other person; unshare takes them back with a receipt', async () => {
  const { handle } = createServer('met')
  const see = async () => (await handle(amara, 'GET /api/people')).people.find((p) => p.id === 'p501')!
  await handle(diego, 'POST /api/people/:id/share', { params: { id: 'p500' }, body: { fields: ['email'] } })
  expect((await see()).theyShared).toMatchObject({ fields: ['email'], contact: { email: 'diego@example.com' } })
  expect((await see()).theyShared?.photo).toMatch(/^data:image/)
  const { receipt } = await handle(diego, 'DELETE /api/people/:id/share', { params: { id: 'p500' } })
  expect(receipt).toMatchObject({ type: 'unshared', fields: ['email'] })
  expect((await see()).theyShared).toBeUndefined()
})

test('a booth request reaches the inbox with no name leaked, and answering it makes a lead', async () => {
  const { handle } = createServer()
  const { cards } = await handle(booth, 'POST /api/scan', { body: { tagIds: [500], source: 'manual' } })
  expect(cards[0].name).toBeNull()
  await handle(booth, 'POST /api/booth/requests', { body: { to: ['p500'], note: 'Hello' } })
  const request = (await handle(amara, 'GET /api/inbox')).requests.find((r) => r.booth.id === 'p580')!
  expect(request).toMatchObject({ status: 'pending', note: 'Hello', source: 'scan' })
  await handle(amara, 'POST /api/inbox/:id', { params: { id: request.id }, body: { action: 'share' } })
  expect((await handle(booth, 'GET /api/booth')).leads.find((l) => l.card.id === 'p500')).toMatchObject({ via: 'request', note: 'Hello', card: { name: 'Amara' } })
})
