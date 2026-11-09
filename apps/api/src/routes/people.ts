import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { cardsFor, giveCards, pairId, profilesById, sources, toKind, toReceipt, type Meeting, type Share } from '../consent.js'
import { contactFields, type Api, type ContactField, type Profile } from '../contract.js'
import { es, ix } from '../es.js'
import { span, traceId, unshares } from '../telemetry.js'

// Share needs a reason to know each other: a meeting in either direction, or a request from that booth.
async function shareWith(viewer: Me, ids: string[], fields?: ContactField[]) {
  const [me, ...found] = await sources([{ _index: ix.profiles, _id: viewer.id }, ...ids.flatMap((id) => [
    { _index: ix.profiles, _id: id }, { _index: ix.meetings, _id: pairId(viewer.id, id) },
    { _index: ix.meetings, _id: pairId(id, viewer.id) }, { _index: ix.requests, _id: pairId(id, viewer.id) },
  ])])
  const to = ids.flatMap((id, i): Profile[] => {
    const [them, mine, theirs, request] = found.slice(i * 4, i * 4 + 4)
    return them && (mine || theirs || request) ? [{ ...them, id }] : []
  })
  await giveCards(to.map((p) => ({ from: viewer.id, to: p, fields: fields ?? me.shareFields ?? [], via: 'manual' as const })))
  return { to, viewer: { ...viewer, starred: me.starred as string[] } }
}

export const people = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .get('/', async (c) => {
    const viewer = c.var.me
    const res = await es.search<Meeting>({
      index: ix.meetings, size: 1000, _source: ['scanner', 'scanned'],
      query: { bool: { should: [{ term: { scanner: viewer.id } }, { term: { scanned: viewer.id } }] } },
    })
    const [me, ...others] = await profilesById([viewer.id, ...res.hits.hits.map(({ _source: m }) => (m!.scanner === viewer.id ? m!.scanned : m!.scanner))])
    // Meetings and shares are re-read by id inside cardsFor, so a share or unshare shows on the next poll.
    const cards = await cardsFor({ ...viewer, starred: me.starred }, others)
    return c.json({ people: cards.sort((a, b) => (b.met?.at ?? '').localeCompare(a.met?.at ?? '')) } satisfies Api['GET /api/people']['res'])
  })
  .post('/share', zValidator('json', z.object({ ids: z.array(z.string().max(64)).min(1).max(200) })), async (c) => {
    const { to } = await shareWith(c.var.me, [...new Set(c.req.valid('json').ids)])
    return c.json({ shared: to.length } satisfies Api['POST /api/people/share']['res'])
  })
  .post('/:id/share', zValidator('json', z.object({ fields: z.array(z.enum(contactFields)).optional() })), async (c) => {
    const { to, viewer } = await shareWith(c.var.me, [c.req.param('id')], c.req.valid('json').fields)
    if (!to.length) return c.json({ error: 'You can only share with someone you have met' }, 404)
    return c.json({ card: (await cardsFor(viewer, to))[0] } satisfies Api['POST /api/people/:id/share']['res'])
  })
  .delete('/:id/share', async (c) => {
    const viewer = c.var.me, id = c.req.param('id'), shareId = pairId(viewer.id, id)
    const [share, me, them] = await sources([{ _index: ix.shares, _id: shareId }, { _index: ix.profiles, _id: viewer.id }, { _index: ix.profiles, _id: id }]) as [Share?, Profile?, Profile?]
    if (!share || !them) return c.json({ error: 'Nothing is shared with this person' }, 404)
    return span('unshare', { to: toKind(them) }, async () => {
      const doc = { owner: viewer.id, who: id, type: 'unshared' as const, fields: share.fields, at: new Date().toISOString(), traceId: traceId() }
      // Deleting the share doc is the unshare: every vault read checks for it by id, so the card is gone at once.
      const [receipt] = await Promise.all([es.index({ index: ix.receipts, document: doc }), es.delete({ index: ix.shares, id: shareId })])
      unshares.add(1, { to: toKind(them) })
      const [card] = await cardsFor({ ...viewer, starred: me?.starred }, [{ ...them, id }])
      return c.json({ card, receipt: toReceipt({ ...doc, id: receipt._id }, new Map([[id, card]])) } satisfies Api['DELETE /api/people/:id/share']['res'])
    })
  })
