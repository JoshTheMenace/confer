import type { estypes } from '@elastic/elasticsearch'
import { es } from './es.js'

export const contactFields = ['email', 'linkedin', 'github'] as const
export const statuses = ['pending', 'deferred', 'granted', 'denied'] as const
export const decisions = { now: 'granted', later: 'deferred', never: 'denied' } as const
export type ContactField = (typeof contactFields)[number]
export type Status = (typeof statuses)[number]
export type Contact = Partial<Record<ContactField, string>>
export type Viewer = { id: string; kind: 'attendee' | 'sponsor' }
export type Profile = Viewer & {
  tagId: number
  displayName: string; pronouns?: string; approach: 'open' | 'ask' | 'quiet'; commPref?: string
  role?: string; interests: string[]; lookingFor: string[]; about?: string
  interestsVisibleTo: ('peers' | 'sponsors')[]; discoverable: boolean
}
export type Card = Viewer & {
  tagId: number
  badge: Pick<Profile, 'displayName' | 'pronouns' | 'approach' | 'commPref'>
  interests?: Pick<Profile, 'role' | 'interests' | 'lookingFor' | 'about'>
  unlocked: ContactField[] // contact fields this viewer may open
  contact?: Contact
}
export type ConsentRequest = { sponsor: string; attendee: string; fields: ContactField[]; status: Status; createdAt: string; expiresAt: string }

// Deterministic ids make catches and requests idempotent (create fails with 409 on repeats).
export const pairId = (from: string, to: string) => `${from}_${to}`

export const expiresAt = (eventEndsAt = process.env.EVENT_ENDS_AT ?? '2026-11-09T18:30:00-07:00') =>
  new Date(Date.parse(eventEndsAt) + 7 * 864e5).toISOString()

export const lowestFreeTag = (taken: number[], max = 500) => {
  const used = new Set(taken)
  for (let t = 0; t < max; t++) if (!used.has(t)) return t
}

export const tally = (all: Status[]) => Object.fromEntries(statuses.map((s) => [s, all.filter((x) => x === s).length])) as Record<Status, number>

// The only who-sees-what rule. Badge: always. Interests: if shared with the viewer's audience.
// Contact: self, a mutual catch between peers, or (sponsors) exactly the granted fields.
export function cardFor({ subject: s, viewer, mutual = false, grantedFields = [] }: { subject: Profile; viewer: Viewer; mutual?: boolean; grantedFields?: ContactField[] }): Card {
  const self = s.id === viewer.id
  const audience = viewer.kind === 'sponsor' ? 'sponsors' : 'peers'
  return {
    id: s.id, tagId: s.tagId, kind: s.kind,
    badge: { displayName: s.displayName, pronouns: s.pronouns, approach: s.approach, commPref: s.commPref },
    ...((self || s.interestsVisibleTo?.includes(audience)) && { interests: { role: s.role, interests: s.interests ?? [], lookingFor: s.lookingFor ?? [], about: s.about } }),
    unlocked: contactFields.filter((f) => self || (viewer.kind === 'sponsor' ? grantedFields.includes(f) : mutual)),
  }
}

// Sponsor aggregates only count attendees who shared interests with sponsors.
export const sponsorAggQuery = (caught: string[]) => ({
  index: 'profiles', size: 0,
  query: { bool: { filter: [{ ids: { values: caught } }, { term: { kind: 'attendee' } }, { term: { interestsVisibleTo: 'sponsors' } }] } },
  aggs: { interests: { terms: { field: 'interests', size: 20 } }, lookingFor: { terms: { field: 'lookingFor', size: 20 } } },
})

export async function findProfiles(query: estypes.QueryDslQueryContainer, size = 10): Promise<Profile[]> {
  const res = await es.search<Omit<Profile, 'id'>>({ index: 'profiles', size, query, _source_excludes: ['tokenHash'] })
  return res.hits.hits.map((h) => ({ ...h._source!, id: h._id! }))
}

export const cardsById = async (viewer: Viewer, ids: string[]) =>
  new Map((await findProfiles({ ids: { values: [...new Set(ids)] } }, ids.length)).map((p) => [p.id, cardFor({ subject: p, viewer })]))

// The single vault read path: callers pass fields cardFor unlocked; every read leaves a receipt.
export async function openVault(attendee: string, viewer: string, fields: ContactField[]): Promise<Contact> {
  const contact = (await es.get<Contact>({ index: 'vault', id: attendee, _source_includes: fields }, { ignore: [404] }))._source ?? {}
  // Receipt = what was actually seen (only filled-in fields), one per viewer and field set, stamped with the latest read.
  const seen = fields.filter((f) => contact[f])
  if (viewer !== attendee && seen.length)
    await es.index({ index: 'receipts', id: `${attendee}_${viewer}_${seen.join(',')}`, document: { attendee, viewer, fields: seen, at: new Date().toISOString() } })
  return contact
}

export const reveal = async (card: Card, viewer: string): Promise<Card> =>
  card.unlocked.length ? { ...card, contact: await openVault(card.id, viewer, card.unlocked) } : card

// Current cards for many subjects: mutual = they caught me back; grants = my granted requests to them.
export async function cardsFor(viewer: Viewer, subjects: Profile[]) {
  if (!subjects.length) return []
  const found = (d: estypes.MgetResponseItem<any>) => ('found' in d && d.found ? d._source : undefined)
  const [back, grants] = await Promise.all([
    es.mget({ index: 'catches', ids: subjects.map((s) => pairId(s.id, viewer.id)) }),
    es.mget<ConsentRequest>({ index: 'consent_requests', ids: subjects.map((s) => pairId(viewer.id, s.id)) }),
  ])
  return Promise.all(subjects.map((subject, i) => {
    const grant: ConsentRequest | undefined = found(grants.docs[i])
    const grantedFields = grant?.status === 'granted' ? grant.fields : []
    return reveal(cardFor({ subject, viewer, mutual: !!found(back.docs[i]), grantedFields }), viewer.id)
  }))
}
