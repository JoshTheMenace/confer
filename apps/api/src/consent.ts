import type { Attachment, BoothRequest, Card, Common, Contact, ContactField, Kind, Profile, Receipt } from './contract.js'
import { es, ix } from './es.js'
import { shares, span, traceId, vaultReads } from './telemetry.js'

export type Viewer = { id: string; kind: Kind; starred?: string[] }
export type Meeting = { scanner: string; scanned: string; kind: 'peer' | 'booth'; source: string; at: string; common: Common[] }
export type Share = { from: string; to: string; fields: ContactField[]; via: 'manual' | 'auto' | 'request'; note?: string; at: string }
export type Vault = Contact & { photo?: string | null }
/** Everything the lens needs to know about one viewer and one subject. */
export type Relation = { subject: Profile; mine?: Meeting; theirs?: Meeting; shareIn?: Share; shareOut?: Share; muted?: boolean; vault?: Vault }

// Deterministic ids make meetings, shares, requests and mutes idempotent and readable by id (real-time, no search refresh).
export const pairId = (from: string, to: string) => `${from}_${to}`
export async function allShares(query: { term: { to: string } } | { terms: { to: string[] } }, source?: string[]): Promise<Share[]> {
  const size = 1000, found: Share[] = []
  let after: any[] | undefined
  for (;;) {
    const page = await es.search<Share>({
      index: ix.shares, size, query, ...(source && { _source: source }), sort: [{ from: 'asc' }, { to: 'asc' }], ...(after && { search_after: after }),
    })
    const hits = page.hits.hits
    found.push(...hits.flatMap((h) => h._source ? [h._source] : []))
    if (hits.length < size) return found
    after = hits.at(-1)!.sort
    if (!after) throw new Error('share search is missing sort values')
  }
}
export const swap = (common: Common[] = []): Common[] => common.map((c) => ({ kind: c.kind, mine: c.theirs, theirs: c.mine }))
export const toKind = (p: { kind: Kind }) => (p.kind === 'sponsor' ? 'booth' : 'peer')
export const eventEndsAt = () => Date.parse(process.env.EVENT_ENDS_AT ?? '2026-11-09T18:30:00-07:00')
export const expiresAt = () => new Date(eventEndsAt() + 7 * 864e5).toISOString()

/** The attendee's own rule, never silence: starred booths, or booths with 2+ things in common. */
export const autoShares = (attendee: Profile, boothId: string, common: Common[]) =>
  attendee.kind === 'attendee' &&
  ((attendee.autoShare === 'starred' && !!attendee.starred?.includes(boothId)) || (attendee.autoShare === 'matching' && common.length >= 2))

/** A booth's 0 to 100 fit for one attendee: what they have in common, plus a bump if the attendee starred the booth. */
export const fitOf = (common: Common[], starred: boolean) =>
  Math.min(100, common.reduce((n, c) => n + (c.kind === 'same' ? 25 : 15), 0) + (starred ? 20 : 0))

// The only who-sees-what rule (docs/design.md, "Privacy rules"). Pure: everything it may reveal is passed in.
export function cardFor(viewer: Viewer, { subject: s, mine, theirs, shareIn, shareOut, muted, vault = {} }: Relation): Card {
  const attendee = s.kind === 'attendee', booth = viewer.kind === 'sponsor'
  const at = [mine?.at, theirs?.at].filter((t) => t !== undefined).sort().at(-1)
  return {
    id: s.id, tagId: s.tagId, kind: s.kind,
    name: attendee && booth && !s.boothsSeeName && !shareIn ? null : s.displayName,
    pronouns: s.pronouns, approach: s.approach, commPref: s.commPref,
    common: mine?.common ?? swap(theirs?.common),
    ...(at && { met: { at, by: mine && theirs ? 'both' : mine ? 'me' : 'them' } }),
    ...(shareIn && {
      theyShared: {
        at: shareIn.at, fields: shareIn.fields, role: s.role, photo: vault.photo ?? undefined,
        contact: Object.fromEntries(shareIn.fields.flatMap((f) => (vault[f] ? [[f, vault[f]]] : []))),
      },
    }),
    ...(shareOut && { iShared: { at: shareOut.at, fields: shareOut.fields } }),
    // An attendee's topics reach a booth they are open to, never a peer.
    ...(attendee && booth && s.openToBooths && { interests: s.interests, role: s.role, about: s.about, stuckOn: s.stuckOn }),
    ...(s.kind === 'sponsor' && {
      interests: s.interests, about: s.about, pitch: s.pitch, attachment: s.attachment,
      starred: !!viewer.starred?.includes(s.id), muted: !!muted,
    }),
  }
}

type Ref = { _index: string; _id: string }
/** Real-time reads by id across indexes; a missing doc is `undefined`. `tokenHash` never leaves Elasticsearch. */
export async function sources(docs: Ref[]): Promise<any[]> {
  if (!docs.length) return []
  const res = await es.mget<any>({ docs, _source_excludes: ['tokenHash'] })
  return res.docs.map((d) => ('found' in d && d.found ? d._source : undefined))
}
export async function profilesById(ids: string[]): Promise<Profile[]> {
  const unique = [...new Set(ids)]
  return (await sources(unique.map((_id) => ({ _index: ix.profiles, _id })))).flatMap((p, i) => (p ? [{ ...p, id: unique[i] }] : []))
}

export async function bulk(operations: object[]) {
  if (!operations.length) return
  const res = await es.bulk({ operations })
  // 409 is a repeated `create`: the first write stands, which is what makes scans idempotent.
  const failed = res.items.filter((i) => Object.values(i)[0]?.error && Object.values(i)[0]?.status !== 409).length
  if (failed) throw new Error(`bulk write failed: ${failed} of ${res.items.length}`)
}

// The single vault read path. A read for someone else needs the owner's share doc and leaves an `opened` receipt:
// one per owner and viewer (stable id), stamped with the latest read. People polls every 2 seconds and a write costs
// about 0.5s, so the stamp is refreshed at most once a minute per share. The key includes the share's own time,
// so an unshare followed by a new share is always stamped on its first read.
const stamped = new Map<string, number>()
const stampKey = (owner: string, viewer: string, share?: Share) => `${pairId(owner, viewer)}@${share?.at ?? ''}`
export function openVault(viewer: string, reads: { owner: string; share?: Share }[]): Promise<Map<string, Vault>> {
  const allowed = reads.filter((r) => r.owner === viewer || (r.share?.from === r.owner && r.share.to === viewer))
  if (!allowed.length) return Promise.resolve(new Map())
  return span('vault.read', { count: allowed.length }, async () => {
    const at = new Date().toISOString()
    const due = allowed.filter((r) => r.owner !== viewer && Date.now() - (stamped.get(stampKey(r.owner, viewer, r.share)) ?? 0) > 60_000)
    const [vaults] = await Promise.all([
      sources(allowed.map((r) => ({ _index: ix.vault, _id: r.owner }))),
      bulk(due.flatMap((r) => [
        { index: { _index: ix.receipts, _id: `${pairId(r.owner, viewer)}_opened` } },
        { owner: r.owner, who: viewer, type: 'opened', fields: r.share!.fields, at, traceId: traceId() },
      ])),
    ])
    for (const r of due) stamped.set(stampKey(r.owner, viewer, r.share), Date.now())
    for (const r of allowed) vaultReads.add(1, { reason: r.owner === viewer ? 'self' : 'share' })
    return new Map(allowed.map((r, i) => [r.owner, vaults[i] ?? {}]))
  })
}

/** The viewer's own profile, plus each person and how the two stand right now. One read by id, so a share or unshare shows at once. */
export async function relations(viewer: Viewer, ids: string[]): Promise<{ me: Profile; rels: Relation[] }> {
  const [me, ...found] = await sources([{ _index: ix.profiles, _id: viewer.id }, ...ids.flatMap((id) => [
    { _index: ix.profiles, _id: id },
    { _index: ix.meetings, _id: pairId(viewer.id, id) }, { _index: ix.meetings, _id: pairId(id, viewer.id) },
    { _index: ix.shares, _id: pairId(id, viewer.id) }, { _index: ix.shares, _id: pairId(viewer.id, id) },
    { _index: ix.mutes, _id: pairId(viewer.id, id) },
  ])])
  const rels = ids.flatMap((id, i): Relation[] => {
    const [subject, mine, theirs, shareIn, shareOut, mute] = found.slice(i * 6, i * 6 + 6)
    return subject ? [{ subject: { ...subject, id }, mine, theirs, shareIn, shareOut, muted: !!mute }] : []
  })
  return { me: { ...me, id: viewer.id }, rels }
}

/** Cards through the lens. The vault is opened only for people with a share to the viewer. */
export async function cards(viewer: Viewer, rels: Relation[]): Promise<Card[]> {
  const vault = await openVault(viewer.id, rels.filter((r) => r.shareIn).map((r) => ({ owner: r.subject.id, share: r.shareIn })))
  return rels.map((r) => cardFor(viewer, { ...r, vault: vault.get(r.subject.id) }))
}

/** Hands over contact cards: one share doc (`from_to`) and one `shared` receipt each, in a single write. Returns the shares. */
export function giveCards(list: { from: string; to: Profile; fields: ContactField[]; via: Share['via']; note?: string }[]): Promise<Share[]> {
  if (!list.length) return Promise.resolve([])
  return span('share', { count: list.length, via: list[0].via }, async () => {
    const at = new Date().toISOString()
    const given = list.map(({ from, to, fields, via, note }): Share => ({ from, to: to.id, fields, via, note, at }))
    await bulk(given.flatMap((s) => [
      { index: { _index: ix.shares, _id: pairId(s.from, s.to) } }, s,
      { index: { _index: ix.receipts } }, { owner: s.from, who: s.to, type: 'shared', fields: s.fields, at, traceId: traceId() },
    ]))
    for (const s of list) shares.add(1, { via: s.via, to: toKind(s.to) })
    return given
  })
}

export type ReceiptDoc = Omit<Receipt, 'who'> & { who: string }
export const toReceipt = (r: ReceiptDoc, who: Map<string, Card>): Receipt =>
  ({ id: r.id, type: r.type, who: who.get(r.who) ?? null, fields: r.fields, at: r.at, traceId: r.traceId })

export type RequestDoc = Omit<BoothRequest, 'id' | 'booth' | 'attachment'> & { booth: string; attendee: string; attachment?: Attachment }
export const toRequest = (id: string, r: RequestDoc, booth: Card): BoothRequest =>
  ({ id, booth, note: r.note, attachment: r.attachment, why: r.why ?? [], status: r.status, source: r.source, createdAt: r.createdAt, expiresAt: r.expiresAt })
