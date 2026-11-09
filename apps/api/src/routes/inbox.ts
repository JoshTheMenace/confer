import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { cardFor, giveCards, pairId, profilesById, sources, toReceipt, toRequest, type ReceiptDoc, type RequestDoc } from '../consent.js'
import { contactFields, type Api } from '../contract.js'
import { es, ix } from '../es.js'
import { requests, span } from '../telemetry.js'

const outcome = { share: 'shared', ignore: 'ignored', mute: 'muted' } as const

export const inbox = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .get('/', async (c) => {
    const viewer = c.var.me
    const [sent, log] = await Promise.all([
      es.search({ index: ix.requests, size: 200, _source: false, query: { term: { attendee: viewer.id } }, sort: [{ createdAt: 'desc' }] }),
      es.search<Omit<ReceiptDoc, 'id'>>({ index: ix.receipts, size: 200, query: { term: { owner: viewer.id } }, sort: [{ at: 'desc' }] }),
    ])
    const ids = sent.hits.hits.map((h) => h._id!)
    // Search only finds the requests; each one (and its mute) is re-read by id, so an answer shows on the next poll.
    const reqs: (RequestDoc | undefined)[] = await sources(ids.map((_id) => ({ _index: ix.requests, _id })))
    const booths = reqs.flatMap((r) => (r ? [r.booth] : []))
    const receipts = log.hits.hits.map((h) => ({ ...h._source!, id: h._id! }))
    const [[me, ...others], mutes] = await Promise.all([
      profilesById([viewer.id, ...booths, ...receipts.map((r) => r.who)]),
      sources(booths.map((b) => ({ _index: ix.mutes, _id: pairId(viewer.id, b) }))),
    ])
    const muted = new Set(booths.filter((_, i) => mutes[i]))
    // Silhouettes only: listing my inbox never opens anyone's vault.
    const cards = new Map(others.map((p) => [p.id, cardFor({ ...viewer, starred: me.starred }, { subject: p, muted: muted.has(p.id) })]))
    return c.json({
      requests: reqs.flatMap((r, i) => {
        const booth = r && cards.get(r.booth)
        return r && booth && !booth.muted ? [toRequest(ids[i], r, booth)] : []
      }),
      receipts: receipts.map((r) => toReceipt(r, cards)),
    } satisfies Api['GET /api/inbox']['res'])
  })
  .post('/:id', zValidator('json', z.object({ action: z.enum(['share', 'ignore', 'mute']), fields: z.array(z.enum(contactFields)).optional() })), async (c) => {
    const viewer = c.var.me, id = c.req.param('id'), { action, fields } = c.req.valid('json')
    const [req]: (RequestDoc | undefined)[] = await sources([{ _index: ix.requests, _id: id }])
    if (req?.attendee !== viewer.id) return c.json({ error: 'not found' }, 404)
    const [me, booth] = await profilesById([viewer.id, req.booth])
    if (!booth) return c.json({ error: 'not found' }, 404)
    return span('request.answer', { action }, async () => {
      const status = action === 'share' ? 'shared' : req.status === 'pending' ? 'ignored' : req.status
      await Promise.all([
        es.update({ index: ix.requests, id, doc: { status } }),
        action === 'share' && giveCards([{ from: viewer.id, to: booth, fields: fields ?? me.shareFields ?? [], via: 'request', note: req.note }]),
        action === 'mute' && es.index({ index: ix.mutes, id: pairId(viewer.id, req.booth), document: { attendee: viewer.id, booth: req.booth, at: new Date().toISOString() } }),
      ])
      requests.add(1, { action: outcome[action] })
      const card = cardFor({ ...viewer, starred: me.starred }, { subject: booth, muted: action === 'mute' })
      return c.json({ request: toRequest(id, { ...req, status }, card) } satisfies Api['POST /api/inbox/:id']['res'])
    })
  })
