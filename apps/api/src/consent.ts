import { randomUUID } from 'node:crypto'
import { commonOf } from './common.js'
import type { Attachment, Card, Common, Contact, ContactField, Kind, Message, Profile, Receipt, Thread } from './contract.js'
import { es, ix } from './es.js'
import { messages, requests, shares, span, traceId, vaultReads } from './telemetry.js'

export type Viewer = { id: string; kind: Kind; starred?: string[] }
export type Meeting = { scanner: string; scanned: string; kind: 'peer' | 'booth'; source: string; at: string; common: Common[] }
export type Share = { from: string; to: string; fields: ContactField[]; via: 'manual' | 'auto' | 'request'; note?: string; at: string }
export type Vault = Contact & { photo?: string | null }
/** `hidden`: sent to someone who muted the sender, so only the sender ever sees it. */
export type Msg = { id: string; from: string; text: string; at: string; hidden?: boolean }
export type ThreadDoc = {
  a: string; b: string; startedBy: string; kind: 'peer' | 'booth'; status: Thread['status']; source: Thread['source']; why: Common[] // why: as the starter sees it
  attachment?: Attachment; firstText: string; createdAt: string; lastAt: string; expiresAt: string; readA?: string; readB?: string; shared?: boolean; messages: Msg[]
}
/** Everything the lens needs to know about one viewer and one subject. `mutedMe` is for sending only: it never reaches a card. */
export type Relation = { subject: Profile; mine?: Meeting; theirs?: Meeting; shareIn?: Share; shareOut?: Share; muted?: boolean; mutedMe?: boolean; thread?: ThreadDoc; vault?: Vault }

// Deterministic ids make meetings, shares, threads and mutes idempotent and readable by id (real-time, no search refresh).
export const pairId = (from: string, to: string) => `${from}_${to}`
export const threadId = (x: string, y: string) => [x, y].sort().join('_')
export const readKey = (t: { a: string }, viewer: string) => (t.a === viewer ? 'readA' : 'readB')
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
export function cardFor(viewer: Viewer, { subject: s, mine, theirs, shareIn, shareOut, muted, thread, vault = {} }: Relation): Card {
  const attendee = s.kind === 'attendee', booth = viewer.kind === 'sponsor'
  const seen = thread && visible(thread, viewer.id).length ? thread : undefined
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
    ...(seen && { thread: { status: seen.status, startedBy: seen.startedBy === viewer.id ? ('me' as const) : ('them' as const), unread: unread(seen, viewer.id) } }),
    // An attendee's topics reach a booth they are open to, never a peer.
    ...(attendee && booth && s.openToBooths && { interests: s.interests, role: s.role, about: s.about, stuckOn: s.stuckOn }),
    ...(s.kind === 'sponsor' && {
      interests: s.interests, about: s.about, pitch: s.pitch, attachment: s.attachment,
      starred: !!viewer.starred?.includes(s.id), muted: !!muted,
    }),
  }
}

/** What one side may see of a thread: everything except messages sent to them while they had the sender muted. */
export const visible = (t: ThreadDoc, viewer: string) => t.messages.filter((m) => !m.hidden || m.from === viewer)
const unread = (t: ThreadDoc, viewer: string) => visible(t, viewer).filter((m) => m.from !== viewer && m.at > (t[readKey(t, viewer)] ?? '')).length
export const toMessages = (t: ThreadDoc, viewer: string): Message[] =>
  visible(t, viewer).map((m) => ({ id: m.id, from: m.from === viewer ? 'me' : 'them', text: m.text, at: m.at }))
/** A thread as one side sees it. Pure. `card` is the other person through the lens: a chat never widens it. */
export function toThread(t: ThreadDoc, viewer: string, card: Card): Thread {
  const mine = t.startedBy === viewer, last = toMessages(t, viewer).at(-1)!
  return {
    id: card.id, with: card, status: t.status, startedBy: mine ? 'me' : 'them', why: mine ? t.why : swap(t.why), source: t.source, attachment: t.attachment,
    last: { text: last.text, at: last.at, from: last.from }, unread: unread(t, viewer), createdAt: t.createdAt,
    ...(t.status === 'request' && { expiresAt: t.expiresAt }),
  }
}

/** Who may send a first message. Returns the reason they may not, in plain words. Pure. */
export const cannotStart = (me: { kind: Kind }, them: Profile, mine?: Meeting, theirs?: Meeting) =>
  them.kind === 'sponsor' ? undefined
    : me.kind === 'sponsor' ? (mine || them.openToBooths ? undefined : 'A booth can only message people it scanned or who are open to booths')
      : mine || theirs || them.discoverable ? undefined : 'You can only message people you have met or who chose to be found'

const append = `def s = ctx._source; s.messages.add(params.m); if (s.messages.size() > 200) s.messages.remove(0);
  s.lastAt = params.m.at; s[params.read] = params.m.at; if (params.open) s.status = 'open'`
/**
 * The one way a message is sent. No thread yet: it becomes a message request. A reply from the recipient opens the chat.
 * The caller has already checked `cannotStart`. If the recipient muted the sender, or ignored the sender's request, the message is
 * stored `hidden`: the recipient never sees or counts it, and the sender can't tell.
 */
export function send(me: Profile, r: Relation, text: string, attachment?: Attachment): Promise<{ doc: ThreadDoc; message: Msg; first: boolean }> {
  const them = r.subject, old = r.thread, to = toKind(them), id = threadId(me.id, them.id)
  return span('message.send', { to, first: !old }, async () => {
    const at = new Date().toISOString(), [a] = [me.id, them.id].sort(), read = readKey({ a }, me.id)
    const unwelcome = r.mutedMe || (old?.status === 'ignored' && old.startedBy === me.id)
    const message: Msg = { id: randomUUID(), from: me.id, text, at, ...(unwelcome && { hidden: true }) }
    const open = !!old && old.startedBy !== me.id && old.status !== 'open'
    const doc: ThreadDoc = old ? { ...old, messages: [...old.messages, message].slice(-200), lastAt: at, [read]: at, ...(open && { status: 'open' }) } : {
      a, b: a === me.id ? them.id : me.id, startedBy: me.id, kind: toKind(me), status: 'request', source: r.mine || r.theirs ? 'scan' : 'match',
      // Frozen like a meeting's: reused if they met, otherwise worked out once, here.
      why: r.mine?.common ?? (r.theirs ? swap(r.theirs.common) : await commonOf(me.interests, them.interests)),
      attachment: attachment ?? (me.kind === 'sponsor' ? me.attachment : undefined), firstText: text, createdAt: at, lastAt: at, expiresAt: expiresAt(), [read]: at, messages: [message],
    }
    // One scripted update appends the message, so two people writing at once never lose one.
    if (old) await es.update({ index: ix.threads, id, retry_on_conflict: 3, script: { source: append, params: { m: message, read, open } } })
    else await es.create({ index: ix.threads, id, document: doc })
    messages.add(1, { to, first: !old })
    if (!old || open) requests.add(1, { action: old ? 'accepted' : 'sent' })
    return { doc, message, first: !old }
  })
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
    { _index: ix.mutes, _id: pairId(viewer.id, id) }, { _index: ix.mutes, _id: pairId(id, viewer.id) }, { _index: ix.threads, _id: threadId(viewer.id, id) },
  ])])
  const rels = ids.flatMap((id, i): Relation[] => {
    const [subject, mine, theirs, shareIn, shareOut, mute, mutedMe, thread] = found.slice(i * 8, i * 8 + 8)
    return subject ? [{ subject: { ...subject, id }, mine, theirs, shareIn, shareOut, muted: !!mute, mutedMe: !!mutedMe, thread }] : []
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
