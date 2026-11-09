import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { commonOf } from '../common.js'
import { autoShares, bulk, cardsFor, giveCards, pairId, profilesById, sources, swap, toKind, type Meeting } from '../consent.js'
import type { Api, Common, Profile } from '../contract.js'
import { ix } from '../es.js'
import { commonSize, scans, span } from '../telemetry.js'

// A person can't really meet 30 people a minute; this stops scripts sweeping every badge id.
const recent = new Map<string, number[]>()
const tooFast = (id: string, n: number, now = Date.now()) => {
  const hits = [...(recent.get(id) ?? []).filter((t) => now - t < 60_000), ...Array(n).fill(now)]
  recent.set(id, hits)
  return hits.length > 30
}

export const scan = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .post('/', zValidator('json', z.object({ tagIds: z.array(z.number().int().min(0).max(586)).min(1).max(10), source: z.enum(['camera', 'manual']) })), async (c) => {
    const viewer = c.var.me, { tagIds, source } = c.req.valid('json')
    if (tooFast(viewer.id, tagIds.length)) return c.json({ error: 'Slow down: that is more badges than anyone can meet in a minute' }, 429)
    // Badge number to profile goes through the tags index by id: real-time, so someone who signed up a second ago is found.
    const tags = await sources([...new Set(tagIds)].map((t) => ({ _index: ix.tags, _id: String(t) })))
    const [me, ...scanned] = await profilesById([viewer.id, ...tags.flatMap((t) => (t ? [t.profile as string] : []))])
    const kindOf = (p: Profile) => (viewer.kind === 'sponsor' ? 'booth' : toKind(p))
    return span('scan', { kind: toKind(viewer), source, count: scanned.length }, async () => {
      const prior = await sources(scanned.flatMap((p) => [
        { _index: ix.meetings, _id: pairId(viewer.id, p.id) }, { _index: ix.meetings, _id: pairId(p.id, viewer.id) }, { _index: ix.shares, _id: pairId(p.id, viewer.id) },
      ]))
      const met = await Promise.all(scanned.map(async (p, i) => {
        const [mine, theirs, shared] = prior.slice(i * 3, i * 3 + 3) as [Meeting?, Meeting?, object?]
        // Things in common are worked out once per pair and frozen, so nobody can probe by editing tags and scanning again.
        const common: Common[] = mine?.common ?? (theirs ? swap(theirs.common) : await commonOf(me.interests, p.interests))
        return { p, common, first: !mine, shared: !!shared }
      }))
      const at = new Date().toISOString(), firsts = met.filter((m) => m.first)
      await Promise.all([
        bulk(firsts.flatMap(({ p, common }) => [
          { create: { _index: ix.meetings, _id: pairId(viewer.id, p.id) } },
          { scanner: viewer.id, scanned: p.id, kind: kindOf(p), source, at, common } satisfies Meeting,
        ])),
        giveCards(viewer.kind !== 'sponsor' ? [] : met.filter((m) => !m.shared && autoShares(m.p, viewer.id, m.common))
          .map(({ p }) => ({ from: p.id, to: me, fields: p.shareFields ?? [], via: 'auto' as const }))),
      ])
      for (const { p, common } of firsts) {
        scans.add(1, { kind: kindOf(p), source })
        commonSize.record(common.length)
      }
      return c.json({ cards: await cardsFor({ ...viewer, starred: me.starred }, scanned) } satisfies Api['POST /api/scan']['res'])
    })
  })
