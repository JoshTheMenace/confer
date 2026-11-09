import { randomBytes, randomUUID } from 'node:crypto'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, hashToken, tokenLink, type Me as Session } from '../auth.js'
import { openVault } from '../consent.js'
import { contactFields, type Api, type Kind, type Me, type Profile } from '../contract.js'
import { es, ix } from '../es.js'
import { log } from '../telemetry.js'

const MAX_INTEREST_EDITS = 5
const FIRST_AUTO_TAG_ID = 587
const AUTO_TAG_COUNT = 500
const tag = z.string().trim().min(1).max(40)
const handle = z.string().trim().max(200)
export const attachment = z.object({ url: z.string().max(500).regex(/^https?:\/\/\S+$/), label: z.string().trim().min(1).max(80) })
const input = z.object({
  displayName: z.string().trim().min(1).max(60),
  pronouns: z.string().max(30).optional(),
  approach: z.enum(['open', 'ask', 'quiet']),
  commPref: z.string().max(140).optional(),
  role: z.string().max(80).optional(),
  interests: z.array(tag).max(20),
  lookingFor: z.array(tag).max(20),
  about: z.string().max(1000).optional(),
  stuckOn: z.string().max(200).optional(),
  discoverable: z.boolean(),
  openToBooths: z.boolean(),
  boothsSeeName: z.boolean(),
  autoShare: z.enum(['off', 'starred', 'matching']),
  shareFields: z.array(z.enum(contactFields)),
  pitch: z.string().max(280).optional(),
  attachment: attachment.optional(),
})
const contact = z.object({ email: z.union([z.email(), z.literal('')]).optional(), linkedin: handle.optional(), github: handle.optional() }) // '' clears
// A small data URL. SVG is allowed for illustrated portraits; the web app only ever shows it in an <img>.
const photo = z.union([z.literal(''), z.string().max(150 * 1024).regex(/^data:image\/(jpeg|png|webp|svg\+xml)[;,]/)], { error: 'Photo must be a JPEG, PNG, WebP or SVG under 150 KB' })
const attendeeInterests = (n: number) => n >= 3 && n <= 8

async function myself(id: string): Promise<Me> {
  const [profile, vault] = await Promise.all([
    es.get<Omit<Profile, 'id'>>({ index: ix.profiles, id, _source_excludes: ['tokenHash', 'interestEdits'] }),
    openVault(id, [{ owner: id }]),
  ])
  const { photo, ...contact } = vault.get(id) ?? {}
  return { ...profile._source!, id, contact, ...(photo && { photo }) }
}

export const me = new Hono<{ Variables: { me: Session } }>()
  .post('/signup', zValidator('json', input.extend({ contact, photo: photo.optional(), code: z.string().optional(), tagId: z.number().int().min(0).max(586).optional() })), async (c) => {
    const { contact, photo, code, tagId: wanted, ...profile } = c.req.valid('json')
    const kind: Kind | undefined = !code ? 'attendee' : code === process.env.SPONSOR_CODE ? 'sponsor' : code === process.env.ORGANIZER_CODE ? 'organizer' : undefined
    if (!kind) return c.json({ error: 'That code is not valid' }, 403)
    if (kind === 'attendee' && !attendeeInterests(profile.interests.length)) return c.json({ error: 'Pick 3 to 8 interests' }, 400)
    const id = randomUUID(), token = randomBytes(32).toString('base64url')
    // One badge, one person: the claim is an atomic create on the tags index (a search can be 5s stale).
    const claim = async (t: number) => (await es.index({ index: ix.tags, id: String(t), op_type: 'create', document: { profile: id } }, { ignore: [409] })).result === 'created'
    let tagId = wanted
    if (wanted !== undefined) {
      // A legacy profile may have no tags-index lock, so check profiles before claiming its printed number.
      const existing = await es.search<{ tagId: number }>({ index: ix.profiles, size: 1, _source: ['tagId'], query: { term: { tagId: wanted } } })
      if (existing.hits.hits.some((h) => h._source?.tagId === wanted) || !(await claim(wanted)))
        return c.json({ error: `Badge ${wanted} already belongs to someone` }, 409)
    } else {
      // 0–586 are printed badge numbers; auto-assigned IDs live outside that range.
      const lastAutoTagId = FIRST_AUTO_TAG_ID + AUTO_TAG_COUNT - 1
      const taken = await es.search<{ tagId: number }>({ index: ix.profiles, size: AUTO_TAG_COUNT, _source: ['tagId'], query: { range: { tagId: { gte: FIRST_AUTO_TAG_ID, lte: lastAutoTagId } } } })
      const takenTags = new Set(taken.hits.hits.map((h) => h._source!.tagId))
      for (let t = FIRST_AUTO_TAG_ID; t <= lastAutoTagId && tagId === undefined; t++) if (!takenTags.has(t) && (await claim(t))) tagId = t
    }
    if (tagId === undefined) return c.json({ error: 'No badges left' }, 409)
    const mine = { ...profile, tagId, kind, starred: [], hasPhoto: !!photo }
    // Independent writes, each ~0.5s on Serverless: run them together.
    await Promise.all([
      es.index({ index: ix.vault, id, document: { ...contact, ...(photo && { photo }) } }),
      es.index({ index: ix.profiles, id, document: { ...mine, interestEdits: 0, tokenHash: hashToken(token) } }),
      es.index(tokenLink(hashToken(token), { id, kind, tagId })),
    ])
    log.info({ profile: id, tagId, kind }, 'signup')
    return c.json({ token, me: { ...mine, id, contact, ...(photo && { photo }) } } satisfies Api['POST /api/me/signup']['res'])
  })
  .get('/', auth, async (c) => c.json({ me: await myself(c.var.me.id) } satisfies Api['GET /api/me']['res']))
  .patch('/', auth, zValidator('json', input.partial().extend({ contact: contact.optional(), photo: photo.optional() })), async (c) => {
    const { contact, photo, ...profile } = c.req.valid('json')
    const { id, kind } = c.var.me
    let interestEdits: number | undefined
    let interestCondition: { if_seq_no: number; if_primary_term: number } | undefined
    if (profile.interests) {
      if (kind === 'attendee' && !attendeeInterests(profile.interests.length)) return c.json({ error: 'Pick 3 to 8 interests' }, 400)
      const got = await es.get<{ interests: string[]; interestEdits?: number }>({ index: ix.profiles, id, _source: ['interests', 'interestEdits'] })
      const now = got._source!
      interestCondition = { if_seq_no: got._seq_no!, if_primary_term: got._primary_term! }
      if (JSON.stringify(now.interests) !== JSON.stringify(profile.interests)) {
        const edits = now.interestEdits ?? 0
        if (edits >= MAX_INTEREST_EDITS)
          return c.json({ error: `You have changed your interests ${MAX_INTEREST_EDITS} times, which is the limit. It stops anyone from swapping tags to work out what other people are into.` }, 409)
        interestEdits = edits + 1
      }
    }
    // The conditional profile write goes first: if it loses a race, nothing else (contact, photo) is saved either.
    try {
      await es.update({ index: ix.profiles, id, ...(interestCondition ?? {}), doc: { ...profile, ...(photo !== undefined && { hasPhoto: !!photo }), ...(interestEdits && { interestEdits }) } })
    } catch (err) {
      // Two edits at once: the second loses instead of slipping past the interest-edit cap.
      if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 409)
        return c.json({ error: 'Your profile was changed somewhere else at the same moment. Please try again.' }, 409)
      throw err
    }
    if (contact || photo !== undefined)
      await es.update({ index: ix.vault, id, doc: { ...contact, ...(photo !== undefined && { photo: photo || null }) }, doc_as_upsert: true })
    return c.json({ me: await myself(id) } satisfies Api['PATCH /api/me']['res'])
  })
