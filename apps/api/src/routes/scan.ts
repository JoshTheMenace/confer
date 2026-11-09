import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { commonOf } from '../common.js'
import { autoShares, bulk, cards, giveCards, pairId, relations, sources, swap, toKind, type Meeting } from '../consent.js'
import type { Api, Common } from '../contract.js'
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
    const { me, rels } = await relations(viewer, [...new Set(tags.flatMap((t) => (t && t.profile !== viewer.id ? [t.profile as string] : [])))])
    return span('scan', { kind: toKind(viewer), source, count: rels.length }, async () => {
      const at = new Date().toISOString()
      const met = await Promise.all(rels.map(async (r) => {
        // Things in common are worked out once per pair and frozen, so nobody can probe by editing tags and scanning again.
        const common: Common[] = r.mine?.common ?? (r.theirs ? swap(r.theirs.common) : await commonOf(me.interests, r.subject.interests))
        const kind = viewer.kind === 'sponsor' ? 'booth' : toKind(r.subject)
        return { ...r, first: !r.mine, mine: r.mine ?? ({ scanner: viewer.id, scanned: r.subject.id, kind, source, at, common } satisfies Meeting) }
      }))
      const firsts = met.filter((m) => m.first)
      const [, auto] = await Promise.all([
        bulk(firsts.flatMap((m) => [{ create: { _index: ix.meetings, _id: pairId(viewer.id, m.subject.id) } }, m.mine])),
        giveCards(viewer.kind !== 'sponsor' ? [] : met.filter((m) => !m.shareIn && autoShares(m.subject, viewer.id, m.mine.common))
          .map((m) => ({ from: m.subject.id, to: me, fields: m.subject.shareFields ?? [], via: 'auto' as const }))),
      ])
      for (const { mine } of firsts) {
        scans.add(1, { kind: mine.kind, source })
        commonSize.record(mine.common.length)
      }
      // Built from what was just read and written: no second read before the card appears.
      const now = met.map((m) => ({ ...m, shareIn: m.shareIn ?? auto.find((s) => s.from === m.subject.id) }))
      return c.json({ cards: await cards({ ...viewer, starred: me.starred }, now) } satisfies Api['POST /api/scan']['res'])
    })
  })
