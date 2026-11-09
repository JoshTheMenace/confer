import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { cardsFor, contactFields, expiresAt, findProfiles, pairId, profilesById } from '../consent.js'
import { es } from '../es.js'
import { catches } from '../telemetry.js'

// A person can't really meet 30 people a minute; this stops scripts sweeping every badge id.
const recent = new Map<string, number[]>()
const tooFast = (id: string, n: number, now = Date.now()) => {
  const hits = [...(recent.get(id) ?? []).filter((t) => now - t < 60_000), ...Array(n).fill(now)]
  recent.set(id, hits)
  return hits.length > 30
}

export const catchRoutes = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .post('/', zValidator('json', z.object({ tagIds: z.array(z.number().int().min(0).max(586)).min(1).max(10) })), async (c) => {
    const me = c.var.me
    if (tooFast(me.id, c.req.valid('json').tagIds.length)) return c.json({ error: 'slow down' }, 429)
    const caught = (await findProfiles({ terms: { tagId: c.req.valid('json').tagIds } })).filter((p) => p.id !== me.id)
    if (!caught.length) return c.json({ cards: [] })
    const kind = me.kind === 'sponsor' ? 'sponsor' : 'peer'
    const at = new Date().toISOString()
    const leads = me.kind === 'sponsor' ? caught.filter((p) => p.kind === 'attendee') : []
    // `create` ops are idempotent: repeats of the same pair fail with 409 and change nothing.
    const res = await es.bulk({
      operations: [
        ...caught.flatMap((p) => [{ create: { _index: 'catches', _id: pairId(me.id, p.id) } }, { catcher: me.id, caught: p.id, kind, at }]),
        ...leads.flatMap((p) => [
          { create: { _index: 'consent_requests', _id: pairId(me.id, p.id) } },
          { sponsor: me.id, attendee: p.id, fields: contactFields, status: 'pending', createdAt: at, expiresAt: expiresAt() },
        ]),
      ],
      refresh: 'wait_for',
    })
    catches.add(res.items.slice(0, caught.length).filter((i) => i.create?.status === 201).length, { kind })
    return c.json({ cards: await cardsFor(me, caught) })
  })
  .get('/dex', async (c) => {
    const me = c.var.me
    const res = await es.search<{ caught: string; at: string }>({ index: 'catches', size: 1000, query: { term: { catcher: me.id } } })
    const caughtAt = new Map(res.hits.hits.map((h) => [h._source!.caught, h._source!.at]))
    const cards = await cardsFor(me, await profilesById([...caughtAt.keys()]))
    return c.json({ dex: cards.map((card) => ({ ...card, caughtAt: caughtAt.get(card.id)! })).sort((a, b) => b.caughtAt.localeCompare(a.caughtAt)) })
  })
