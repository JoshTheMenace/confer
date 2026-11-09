import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { cards, giveCards, pairId, relations, sources, toKind, toReceipt, type Meeting } from '../consent.js'
import { contactFields, type Api, type ContactField } from '../contract.js'
import { es, ix } from '../es.js'
import { span, traceId, unshares } from '../telemetry.js'

// Share needs a reason to know each other: a meeting in either direction, or a request from that booth.
async function shareWith(viewer: Me, ids: string[], fields?: ContactField[]) {
  const [{ me, rels }, asked] = await Promise.all([relations(viewer, ids), sources(ids.map((id) => ({ _index: ix.requests, _id: pairId(id, viewer.id) })))])
  const requested = new Set(ids.filter((_, i) => asked[i]))
  const to = rels.filter((r) => r.mine || r.theirs || requested.has(r.subject.id))
  const given = await giveCards(to.map((r) => ({ from: viewer.id, to: r.subject, fields: fields ?? me.shareFields ?? [], via: 'manual' as const })))
  return { viewer: { ...viewer, starred: me.starred }, rels: to.map((r, i) => ({ ...r, shareOut: given[i] })) }
}

export const people = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .get('/', async (c) => {
    const viewer = c.var.me
    const res = await es.search<Meeting>({
      index: ix.meetings, size: 1000, _source: ['scanner', 'scanned'],
      query: { bool: { should: [{ term: { scanner: viewer.id } }, { term: { scanned: viewer.id } }] } },
    })
    // Search only says who I met; meetings and shares are then read by id, so a share or unshare shows on the next poll.
    const { me, rels } = await relations(viewer, [...new Set(res.hits.hits.map(({ _source: m }) => (m!.scanner === viewer.id ? m!.scanned : m!.scanner)))])
    const list = await cards({ ...viewer, starred: me.starred }, rels)
    return c.json({ people: list.sort((a, b) => (b.met?.at ?? '').localeCompare(a.met?.at ?? '')) } satisfies Api['GET /api/people']['res'])
  })
  .post('/share', zValidator('json', z.object({ ids: z.array(z.string().max(64)).min(1).max(200) })), async (c) => {
    const { rels } = await shareWith(c.var.me, [...new Set(c.req.valid('json').ids)])
    return c.json({ shared: rels.length } satisfies Api['POST /api/people/share']['res'])
  })
  .post('/:id/share', zValidator('json', z.object({ fields: z.array(z.enum(contactFields)).optional() })), async (c) => {
    const { viewer, rels } = await shareWith(c.var.me, [c.req.param('id')], c.req.valid('json').fields)
    if (!rels.length) return c.json({ error: 'You can only share with someone you have met' }, 404)
    return c.json({ card: (await cards(viewer, rels))[0] } satisfies Api['POST /api/people/:id/share']['res'])
  })
  .delete('/:id/share', async (c) => {
    const viewer = c.var.me, id = c.req.param('id')
    const { me, rels: [rel] } = await relations(viewer, [id])
    if (!rel?.shareOut) return c.json({ error: 'Nothing is shared with this person' }, 404)
    return span('unshare', { to: toKind(rel.subject) }, async () => {
      const doc = { owner: viewer.id, who: id, type: 'unshared' as const, fields: rel.shareOut!.fields, at: new Date().toISOString(), traceId: traceId() }
      // Deleting the share doc is the unshare: every vault read checks for it by id, so the card is gone at once.
      const [receipt] = await Promise.all([es.index({ index: ix.receipts, document: doc }), es.delete({ index: ix.shares, id: pairId(viewer.id, id) })])
      unshares.add(1, { to: toKind(rel.subject) })
      const [card] = await cards({ ...viewer, starred: me.starred }, [{ ...rel, shareOut: undefined }])
      return c.json({ card, receipt: toReceipt({ ...doc, id: receipt._id }, new Map([[id, card]])) } satisfies Api['DELETE /api/people/:id/share']['res'])
    })
  })
