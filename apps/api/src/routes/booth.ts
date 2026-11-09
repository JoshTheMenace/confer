import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { autoShares, bulk, cannotStart, cards, fitOf, giveCards, relations, send, threadId, type Meeting, type Share, type ThreadDoc } from '../consent.js'
import type { Api, Term } from '../contract.js'
import { es, ix, refreshSoon } from '../es.js'
import { attachment } from './me.js'

const top = (terms: string[], size = 10): Term[] =>
  [...terms.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string, number>())].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count).slice(0, size)

export const booth = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .use(async (c, next) => (c.var.me.kind === 'sponsor' ? next() : c.json({ error: 'Booths only' }, 403)))
  .get('/', async (c) => {
    const viewer = c.var.me
    const [scanned, sent, shared] = await Promise.all([
      es.search<Meeting>({ index: ix.meetings, size: 1000, _source: ['scanned'], query: { term: { scanner: viewer.id } } }),
      es.search<ThreadDoc>({ index: ix.threads, size: 1000, _source: ['a', 'b'], query: { term: { startedBy: viewer.id } } }),
      es.search<Share>({ index: ix.shares, size: 1000, _source: ['from'], query: { term: { to: viewer.id } } }),
    ])
    const ids = [...scanned.hits.hits.map((h) => h._source!.scanned), ...sent.hits.hits.map(({ _source: t }) => (t!.a === viewer.id ? t!.b : t!.a)), ...shared.hits.hits.map((h) => h._source!.from)]
    // Shares and threads are re-read by id here: someone who unshared a second ago is not a lead, whatever search still says.
    const rels = (await relations(viewer, [...new Set(ids)])).rels.filter((r) => r.subject.kind === 'attendee')
    const list = await cards(viewer, rels), seen = rels.map((r, i) => ({ ...r, card: list[i] }))
    const visitors = seen.filter((r) => r.mine), asked = seen.filter((r) => r.thread?.startedBy === viewer.id), won = asked.filter((r) => r.shareIn)
    const waiting = (status: ThreadDoc['status']) => asked.filter((r) => !r.shareIn && r.thread!.status === status).length
    return c.json({
      leads: seen.filter((r) => r.shareIn)
        .map((r) => ({ card: r.card, sharedAt: r.shareIn!.at, via: r.shareIn!.via, note: r.shareIn!.note }))
        .sort((a, b) => b.sharedAt.localeCompare(a.sharedAt)),
      visitors: visitors.map((r) => ({
        card: r.card, fit: fitOf(r.mine!.common, !!r.subject.starred?.includes(viewer.id)), source: 'scan' as const, scannedAt: r.mine!.at,
        ...(r.thread?.startedBy === viewer.id && { request: { status: r.thread.status, note: r.thread.firstText, sentAt: r.thread.createdAt } }),
      })).sort((a, b) => b.fit - a.fit),
      stats: {
        scans: visitors.length, requests: asked.length, pending: waiting('request'), shared: won.length, ignored: waiting('ignored'),
        shareRate: asked.length ? won.length / asked.length : 0,
        contentDelivered: asked.filter((r) => r.thread!.attachment).length,
        // Totals only, and only from people who let booths see their topics.
        topInterests: top(visitors.filter((r) => r.subject.openToBooths).flatMap((r) => r.subject.interests)),
        notes: top(asked.map((r) => r.thread!.firstText)).map(({ term: note, count: sent }) => {
          const shared = won.filter((r) => r.thread!.firstText === note).length
          return { note, sent, shared, rate: shared / sent }
        }),
      },
    } satisfies Api['GET /api/booth']['res'])
  })
  .post('/requests', zValidator('json', z.object({ to: z.array(z.string().max(64)).min(1).max(200), note: z.string().trim().min(1).max(500), attachment: attachment.optional() })), async (c) => {
    const viewer = c.var.me, body = c.req.valid('json')
    if (body.attachment && !body.attachment.url.startsWith('https://')) return c.json({ error: 'The attachment link must start with https://' }, 400)
    const { me, rels } = await relations(viewer, [...new Set(body.to)])
    // Attendees only, and only the ones this booth may write to. Someone who muted the booth still counts as sent: a mute is never revealed.
    const to = rels.filter((r) => r.subject.kind === 'attendee' && (r.thread || !cannotStart(viewer, r.subject, r.mine)))
    const sent = await Promise.all(to.map((r) => send(me, r, body.note, r.thread ? undefined : body.attachment)))
    if (sent.some((s) => s.first)) refreshSoon(ix.threads) // the inbox is a search: without this a new request takes up to 5s to reach the other person
    // The attendee's own rule, set before this request: starred or matching booths get the card at once.
    const auto = to.filter((r, i) => !r.shareIn && !r.mutedMe && autoShares(r.subject, viewer.id, sent[i].doc.why))
    await Promise.all([
      giveCards(auto.map((r) => ({ from: r.subject.id, to: me, fields: r.subject.shareFields ?? [], via: 'auto' as const, note: body.note }))),
      bulk(auto.flatMap((r) => [{ update: { _index: ix.threads, _id: threadId(viewer.id, r.subject.id) } }, { doc: { shared: true } }])),
    ])
    return c.json({ sent: to.length, autoShared: auto.length } satisfies Api['POST /api/booth/requests']['res'])
  })
