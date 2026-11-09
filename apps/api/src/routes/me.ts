import { randomBytes, randomUUID } from 'node:crypto'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, hashToken, type Me } from '../auth.js'
import { cardFor, findProfiles, openVault } from '../consent.js'
import { es } from '../es.js'
import { log } from '../telemetry.js'

const handle = z.union([z.string().trim().max(200), z.literal('')])
const envelopes = z.object({
  displayName: z.string().trim().min(1).max(60),
  pronouns: z.string().max(30).optional(),
  approach: z.enum(['open', 'ask', 'quiet']),
  commPref: z.string().max(140).optional(),
  role: z.string().max(80).optional(),
  interests: z.array(z.string().max(40)).max(20),
  lookingFor: z.array(z.string().max(40)).max(20),
  about: z.string().max(1000).optional(),
  interestsVisibleTo: z.array(z.enum(['peers', 'sponsors'])),
  discoverable: z.boolean(),
  contact: z.object({ email: z.union([z.email(), z.literal('')]).optional(), linkedin: handle.optional(), github: handle.optional() }), // '' clears
})

async function myself(viewer: Me) {
  const [p] = await findProfiles({ ids: { values: [viewer.id] } }, 1)
  return { ...p, contact: await openVault(p.id, viewer.id, cardFor({ subject: p, viewer }).unlocked) }
}

export const me = new Hono<{ Variables: { me: Me } }>()
  .post('/signup', zValidator('json', envelopes.extend({ sponsorCode: z.string().optional() })), async (c) => {
    const { contact, sponsorCode, ...profile } = c.req.valid('json')
    const taken = await es.search<{ tagId: number }>({ index: 'profiles', size: 500, _source: ['tagId'], query: { range: { tagId: { lt: 500 } } } })
    const takenTags = new Set(taken.hits.hits.map((h) => h._source!.tagId))
    const candidates = Array.from({ length: 500 }, (_, t) => t).filter((t) => !takenTags.has(t))
    const id = randomUUID(), token = randomBytes(32).toString('base64url')
    let tagId: number | undefined
    for (const t of candidates) {
      const r = await es.index({ index: 'tags', id: String(t), op_type: 'create', document: { profile: id } }, { ignore: [409] })
      if (r.result === 'created') { tagId = t; break }
    }
    if (tagId === undefined) return c.json({ error: 'no badges left' }, 409)
    const kind = process.env.SPONSOR_CODE && sponsorCode === process.env.SPONSOR_CODE ? 'sponsor' : 'attendee'
    await es.index({ index: 'vault', id, document: contact })
    await es.index({ index: 'profiles', id, document: { ...profile, tagId, kind, tokenHash: hashToken(token) }, refresh: 'wait_for' })
    log.info({ profile: id, tagId, kind }, 'signup')
    return c.json({ token, me: { ...profile, id, tagId, kind, contact } })
  })
  .get('/', auth, async (c) => c.json({ me: await myself(c.var.me) }))
  .patch('/', auth, zValidator('json', envelopes.partial()), async (c) => {
    const { contact, ...profile } = c.req.valid('json')
    const id = c.var.me.id
    if (contact) await es.update({ index: 'vault', id, doc: contact, doc_as_upsert: true })
    await es.update({ index: 'profiles', id, doc: profile, refresh: 'wait_for' })
    return c.json({ me: await myself(c.var.me) })
  })
