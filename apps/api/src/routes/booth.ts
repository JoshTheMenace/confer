import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { commonOf } from '../common.js'
import { autoShares, bulk, cards, expiresAt, fitOf, giveCards, pairId, profilesById, relations, sources, swap, type Meeting, type RequestDoc, type Share } from '../consent.js'
import type { Api, Common, Profile, Term } from '../contract.js'
import { es, ix } from '../es.js'
import { requests, span } from '../telemetry.js'
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
      es.search<RequestDoc>({ index: ix.requests, size: 1000, query: { term: { booth: viewer.id } } }),
      es.search<Share>({ index: ix.shares, size: 1000, _source: ['from'], query: { term: { to: viewer.id } } }),
    ])
    const reqs = sent.hits.hits.map((h) => h._source!), byAttendee = new Map(reqs.map((r) => [r.attendee, r]))
    const ids = [...scanned.hits.hits.map((h) => h._source!.scanned), ...byAttendee.keys(), ...shared.hits.hits.map((h) => h._source!.from)]
    // Shares are re-read by id here: someone who unshared a second ago is not a lead, whatever search still says.
    const rels = (await relations(viewer, [...new Set(ids)])).rels.filter((r) => r.subject.kind === 'attendee')
    const list = await cards(viewer, rels), seen = rels.map((r, i) => ({ ...r, card: list[i] }))
    const visitors = seen.filter((r) => r.mine), count = (status: RequestDoc['status']) => reqs.filter((r) => r.status === status).length
    return c.json({
      leads: seen.filter((r) => r.shareIn)
        .map((r) => ({ card: r.card, sharedAt: r.shareIn!.at, via: r.shareIn!.via, note: r.shareIn!.note }))
        .sort((a, b) => b.sharedAt.localeCompare(a.sharedAt)),
      visitors: visitors.map((r) => {
        const req = byAttendee.get(r.subject.id)
        return {
          card: r.card, fit: fitOf(r.mine!.common, !!r.subject.starred?.includes(viewer.id)), source: 'scan' as const, scannedAt: r.mine!.at,
          ...(req && { request: { status: req.status, note: req.note, sentAt: req.createdAt } }),
        }
      }).sort((a, b) => b.fit - a.fit),
      stats: {
        scans: visitors.length, requests: reqs.length, pending: count('pending'), shared: count('shared'), ignored: count('ignored'),
        shareRate: reqs.length ? count('shared') / reqs.length : 0,
        contentDelivered: reqs.filter((r) => r.attachment).length,
        // Totals only, and only from people who let booths see their topics.
        topInterests: top(visitors.filter((r) => r.subject.openToBooths).flatMap((r) => r.subject.interests)),
        notes: top(reqs.map((r) => r.note)).map(({ term: note, count: sent }) => {
          const won = reqs.filter((r) => r.note === note && r.status === 'shared').length
          return { note, sent, shared: won, rate: won / sent }
        }),
      },
    } satisfies Api['GET /api/booth']['res'])
  })
  .post('/requests', zValidator('json', z.object({ to: z.array(z.string().max(64)).min(1).max(200), note: z.string().trim().min(1).max(280), attachment: attachment.optional() })), async (c) => {
    const viewer = c.var.me, body = c.req.valid('json'), ids = [...new Set(body.to)]
    const [[me], found] = await Promise.all([
      profilesById([viewer.id]),
      sources(ids.flatMap((id) => [
        { _index: ix.profiles, _id: id }, { _index: ix.meetings, _id: pairId(viewer.id, id) }, { _index: ix.meetings, _id: pairId(id, viewer.id) },
        { _index: ix.mutes, _id: pairId(id, viewer.id) }, { _index: ix.shares, _id: pairId(id, viewer.id) },
      ])),
    ])
    return span('request.send', { count: ids.length }, async () => {
      const targets = await Promise.all(ids.flatMap((id, i) => {
        const [p, mine, theirs, mute, share] = found.slice(i * 5, i * 5 + 5) as [Profile?, Meeting?, Meeting?, object?, Share?]
        // Only attendees I scanned or who said matching booths may reach out; never anyone who muted me.
        if (p?.kind !== 'attendee' || mute || !(mine || theirs || p.openToBooths)) return []
        return [(async () => {
          const why: Common[] = mine ? swap(mine.common) : theirs ? theirs.common : await commonOf(p.interests, me.interests)
          const meeting = mine || theirs
          return { p: { ...p, id }, why, source: meeting ? ('scan' as const) : ('match' as const), shared: !!share, auto: !share && autoShares(p, viewer.id, why) }
        })()]
      }))
      const createdAt = new Date().toISOString(), auto = targets.filter((t) => t.auto)
      await Promise.all([
        bulk(targets.flatMap((t) => [
          { create: { _index: ix.requests, _id: pairId(viewer.id, t.p.id) } },
          {
            booth: viewer.id, attendee: t.p.id, note: body.note, attachment: body.attachment ?? me.attachment, why: t.why,
            status: t.shared || t.auto ? 'shared' : 'pending', source: t.source, createdAt, expiresAt: expiresAt(),
          } satisfies RequestDoc,
        ])),
        giveCards(auto.map((t) => ({ from: t.p.id, to: me, fields: t.p.shareFields ?? [], via: 'auto' as const, note: body.note }))),
      ])
      requests.add(targets.length, { action: 'sent' })
      return c.json({ sent: targets.length, autoShared: auto.length } satisfies Api['POST /api/booth/requests']['res'])
    })
  })
