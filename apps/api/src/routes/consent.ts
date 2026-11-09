import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { cardsById, contactFields, decisions, type ConsentRequest, type ContactField } from '../consent.js'
import { es } from '../es.js'
import { consentDecisions } from '../telemetry.js'

export const consent = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .get('/', async (c) => {
    const me = c.var.me
    const res = await es.search<ConsentRequest>({ index: 'consent_requests', size: 500, query: { term: { attendee: me.id } }, sort: [{ createdAt: 'desc' }] })
    const sponsors = await cardsById(me, res.hits.hits.map((h) => h._source!.sponsor))
    return c.json({
      requests: res.hits.hits.filter((h) => sponsors.has(h._source!.sponsor)).map((h) => ({ id: h._id!, ...h._source!, sponsor: sponsors.get(h._source!.sponsor)! })),
    })
  })
  .get('/receipts', async (c) => {
    const me = c.var.me
    const res = await es.search<{ viewer: string; fields: ContactField[]; at: string }>({
      index: 'receipts', size: 500, sort: [{ at: 'desc' }],
      query: { bool: { filter: [{ term: { attendee: me.id } }], must_not: [{ term: { viewer: me.id } }] } }, // hide my own reads
    })
    const viewers = await cardsById(me, res.hits.hits.map((h) => h._source!.viewer))
    return c.json({ receipts: res.hits.hits.map(({ _source: r }) => ({ fields: r!.fields, at: r!.at, viewer: viewers.get(r!.viewer) ?? null })) })
  })
  .post('/:id', zValidator('json', z.object({ decision: z.enum(['now', 'later', 'never']), fields: z.array(z.enum(contactFields)).min(1).optional() })), async (c) => {
    const { decision, fields } = c.req.valid('json')
    const req = await es.get<ConsentRequest>({ index: 'consent_requests', id: c.req.param('id') }, { ignore: [404] })
    if (req._source?.attendee !== c.var.me.id) return c.json({ error: 'not found' }, 404)
    const status = decisions[decision]
    await es.update({ index: 'consent_requests', id: req._id, doc: { status, ...(status === 'granted' && { fields: fields ?? contactFields }) } })
    consentDecisions.add(1, { outcome: status })
    return c.json({ id: req._id, status })
  })
