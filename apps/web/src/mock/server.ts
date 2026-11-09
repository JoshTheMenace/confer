import type { Api, Attachment, BoothRequest, BoothStats, Card, Common, Contact, ContactField, Lead, Receipt, Visitor } from '../api'
import { related, seedProfiles, talks, type MockProfile } from './fixtures'

// The whole API in memory: same routes, same lens (who sees what), real state changes.
type Meeting = { ids: [string, string]; at: string; scanners: Set<string>; common: Common[] } // common is from ids[0]'s side, frozen
type Share = { from: string; to: string; fields: ContactField[]; at: string; via: Lead['via']; note?: string }
type Req = Omit<BoothRequest, 'booth' | 'why'> & { booth: string; to: string }
type Rec = Omit<Receipt, 'who'> & { owner: string; who: string }
type Ctx<K extends keyof Api> = { me: MockProfile; id: string; q?: string; body: Api[K] extends { body: infer B } ? B : undefined }

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString()
const trace = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
const norm = (s: string) => s.trim().toLowerCase()
const has = (list: string[], tag: string) => list.some((t) => norm(t) === norm(tag))

export function commonOf(mine: string[], theirs: string[]): Common[] {
  const same = mine.filter((m) => has(theirs, m)).map((m) => ({ kind: 'same' as const, mine: m, theirs: m }))
  const near = related.flatMap(([a, b]) => [[a, b], [b, a]]).filter(([m, t]) => has(mine, m) && has(theirs, t) && !has(theirs, m) && !has(mine, t))
  return [...same, ...near.map(([m, t]) => ({ kind: 'related' as const, mine: m, theirs: t }))]
}

const stop = new Set(['stuck', 'across', 'with', 'that', 'what', 'from', 'have', 'about', 'services', 'need', 'help'])
/** Topics a free-text query touches, widened by related tags. */
function topicsFor(q: string, topics: string[]) {
  const words = norm(q).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !stop.has(w))
  const direct = topics.filter((t) => words.some((w) => norm(t).includes(w)) || norm(q).includes(norm(t)))
  return [...new Set([...direct, ...topics.filter((t) => related.some(([a, b]) => (has(direct, a) && norm(b) === norm(t)) || (has(direct, b) && norm(a) === norm(t))))])]
}
const fitOf = (hits: number) => Math.min(98, 52 + hits * 15)

export function createServer(demo: string | null = null) {
  const profiles = seedProfiles()
  const meetings: Meeting[] = [], shares: Share[] = [], requests: Req[] = [], receipts: Rec[] = [], mutes: { by: string; booth: string }[] = []
  const events: { t: number; type: 'scan' | 'share' }[] = []
  let unshares = 0, seq = 0
  const by = (id: string) => profiles.find((p) => p.id === id)!
  const meetingOf = (a: string, b: string) => meetings.find((m) => m.ids.includes(a) && m.ids.includes(b))
  const shareOf = (from: string, to: string) => shares.find((s) => s.from === from && s.to === to)
  const receipt = (owner: string, type: Receipt['type'], who: string, fields: ContactField[], at: string) => receipts.unshift({ id: `r${++seq}`, owner, type, who, fields, at, traceId: trace() })

  function meet(scanner: string, other: string, at = ago(0)) {
    let m = meetingOf(scanner, other)
    if (!m) meetings.unshift((m = { ids: [scanner, other], at, scanners: new Set(), common: commonOf(by(scanner).interests, by(other).interests) }))
    m.scanners.add(scanner)
    events.push({ t: Date.parse(at), type: 'scan' })
  }
  function share(from: string, to: string, fields = by(from).shareFields, via: Lead['via'] = 'manual', note?: string, at = ago(0)) {
    const old = shareOf(from, to)
    if (old) shares.splice(shares.indexOf(old), 1)
    shares.unshift({ from, to, fields, at, via, note })
    receipt(from, 'shared', to, fields, at)
    events.push({ t: Date.parse(at), type: 'share' })
  }
  function request(booth: string, to: string, note: string, attachment: Attachment | undefined, status: Req['status'] = 'pending', min = 0) {
    requests.unshift({ id: `q${++seq}`, booth, to, note, attachment, status, source: meetingOf(booth, to) ? 'scan' : 'match', createdAt: ago(min), expiresAt: ago(-60 * 24) })
    if (status === 'shared') share(to, booth, undefined, 'request', note, ago(Math.max(0, min - 2)))
  }

  /** The lens: what `viewer` may know about `subject`. */
  function card(viewer: string, subject: string): Card {
    const v = by(viewer), s = by(subject), m = meetingOf(viewer, subject), theirs = shareOf(subject, viewer), mine = shareOf(viewer, subject)
    const booth = s.kind === 'sponsor', forBooth = v.kind === 'sponsor' && s.kind === 'attendee'
    const pick = (c: Contact, fields: ContactField[]) => Object.fromEntries(fields.filter((f) => c[f]).map((f) => [f, c[f]])) as Contact
    return {
      id: s.id, tagId: s.tagId, kind: s.kind, name: forBooth && !s.boothsSeeName && !theirs ? null : s.displayName,
      pronouns: s.pronouns || undefined, approach: s.approach, commPref: s.commPref || undefined,
      common: m && !booth && !forBooth ? (m.ids[0] === viewer ? m.common : m.common.map((c) => ({ ...c, mine: c.theirs, theirs: c.mine }))) : commonOf(v.interests, s.interests),
      met: m && { at: m.at, by: m.scanners.size > 1 ? 'both' : m.scanners.has(viewer) ? 'me' : 'them' },
      theyShared: theirs && { at: theirs.at, fields: theirs.fields, contact: pick(s.contact, theirs.fields), photo: s.photo, role: s.role },
      iShared: mine && { at: mine.at, fields: mine.fields },
      ...(booth && { role: s.role, interests: s.interests, about: s.about, pitch: s.pitch, attachment: s.attachment, starred: v.starred.includes(s.id), muted: mutes.some((x) => x.by === viewer && x.booth === s.id) }),
      ...(forBooth && { interests: s.interests, stuckOn: s.openToBooths ? s.stuckOn : undefined }),
    }
  }
  const requestFor = (r: Req): BoothRequest => ({ ...r, booth: card(r.to, r.booth), why: commonOf(by(r.to).interests, by(r.booth).interests) })
  const visitor = (booth: string, id: string): Visitor => {
    const c = card(booth, id), r = requests.find((x) => x.booth === booth && x.to === id), m = meetingOf(booth, id)
    return { card: c, fit: fitOf(c.common.length + (by(id).stuckOn && topicsFor(by(id).stuckOn!, by(booth).interests).length ? 1 : 0)), source: m ? 'scan' : 'match', scannedAt: m?.at, request: r && { status: r.status, note: r.note, sentAt: r.createdAt } }
  }
  const publicMe = ({ token: _token, ...me }: MockProfile) => me

  const routes: { [K in keyof Api]: (c: Ctx<K>) => Api[K]['res'] } = {
    'POST /api/me/signup': ({ body: { code, photo, contact, ...input } }) => {
      const tagId = Math.max(...profiles.filter((p) => p.tagId < 580).map((p) => p.tagId)) + 1
      const me: MockProfile = { ...input, id: `p${tagId}`, tagId, kind: code === 'booth' ? 'sponsor' : code === 'organizer' ? 'organizer' : 'attendee', starred: [], hasPhoto: !!photo, photo, contact, token: `mock-${tagId}` }
      profiles.push(me)
      return { token: me.token, me: publicMe(me) }
    },
    'GET /api/me': ({ me }) => ({ me: publicMe(me) }),
    'PATCH /api/me': ({ me, body }) => {
      Object.assign(me, body, body.photo === undefined ? {} : { photo: body.photo || undefined, hasPhoto: !!body.photo })
      return { me: publicMe(me) }
    },
    'POST /api/scan': ({ me, body }) => {
      const found = profiles.filter((p) => body.tagIds.includes(p.tagId) && p.id !== me.id)
      if (!found.length) throw new Error(`No badge ${body.tagIds.join(', ')} at this event.`)
      found.forEach((p) => meet(me.id, p.id))
      return { cards: found.map((p) => card(me.id, p.id)) }
    },
    'GET /api/people': ({ me }) => ({ people: meetings.filter((m) => m.ids.includes(me.id)).map((m) => card(me.id, m.ids.find((i) => i !== me.id)!)) }),
    'POST /api/people/:id/share': ({ me, id, body }) => (share(me.id, id, body.fields), { card: card(me.id, id) }),
    'DELETE /api/people/:id/share': ({ me, id }) => {
      const old = shareOf(me.id, id)
      if (!old) throw new Error('Nothing is shared with them.')
      shares.splice(shares.indexOf(old), 1)
      unshares++
      receipt(me.id, 'unshared', id, old.fields, ago(0))
      return { card: card(me.id, id), receipt: { ...receipts[0], who: card(me.id, id) } }
    },
    'POST /api/people/share': ({ me, body }) => {
      const fresh = body.ids.filter((id) => !shareOf(me.id, id))
      fresh.forEach((id) => share(me.id, id))
      return { shared: fresh.length }
    },
    'GET /api/inbox': ({ me }) => ({
      requests: requests.filter((r) => r.to === me.id && !mutes.some((x) => x.by === me.id && x.booth === r.booth && r.status === 'pending')).map(requestFor),
      receipts: receipts.filter((r) => r.owner === me.id).map((r) => ({ ...r, who: card(me.id, r.who) })),
    }),
    'POST /api/inbox/:id': ({ me, id, body }) => {
      const r = requests.find((x) => x.id === id && x.to === me.id)
      if (!r) throw new Error('That request is gone.')
      r.status = body.action === 'share' ? 'shared' : 'ignored'
      if (body.action === 'share') share(me.id, r.booth, body.fields, 'request', r.note)
      if (body.action === 'mute') mutes.push({ by: me.id, booth: r.booth })
      return { request: requestFor(r) }
    },
    'GET /api/booth': ({ me }) => {
      const mine = requests.filter((r) => r.booth === me.id), got = shares.filter((s) => s.to === me.id)
      const count = (status: Req['status']) => mine.filter((r) => r.status === status).length
      const terms = new Map<string, number>()
      meetings.filter((m) => m.ids.includes(me.id)).forEach((m) => by(m.ids.find((i) => i !== me.id)!).interests.forEach((t) => terms.set(t, (terms.get(t) ?? 0) + 1)))
      const stats: BoothStats = {
        scans: meetings.filter((m) => m.scanners.has(me.id)).length, requests: mine.length, pending: count('pending'), shared: count('shared'), ignored: count('ignored'),
        shareRate: mine.length ? count('shared') / mine.length : 0, contentDelivered: mine.filter((r) => r.attachment).length,
        topInterests: [...terms].map(([term, n]) => ({ term, count: n })).sort((a, b) => b.count - a.count).slice(0, 5),
        notes: [...new Set(mine.map((r) => r.note))].map((note) => {
          const sent = mine.filter((r) => r.note === note), won = sent.filter((r) => r.status === 'shared').length
          return { note, sent: sent.length, shared: won, rate: won / sent.length }
        }),
      }
      const scanned = meetings.filter((m) => m.ids.includes(me.id)).map((m) => m.ids.find((i) => i !== me.id)!).filter((id) => !shareOf(id, me.id))
      return { leads: got.map((s) => ({ card: card(me.id, s.from), sharedAt: s.at, via: s.via, note: s.note })), visitors: scanned.map((id) => visitor(me.id, id)).sort((a, b) => b.fit - a.fit), stats }
    },
    'POST /api/booth/requests': ({ me, body }) => {
      const to = body.to.filter((id) => !requests.some((r) => r.booth === me.id && r.to === id) && !mutes.some((x) => x.by === id && x.booth === me.id))
      const auto = to.filter((id) => by(id).autoShare === 'matching' || (by(id).autoShare === 'starred' && by(id).starred.includes(me.id)))
      to.forEach((id) => request(me.id, id, body.note, body.attachment ?? me.attachment, auto.includes(id) ? 'shared' : 'pending'))
      return { sent: to.length, autoShared: auto.length }
    },
    'GET /api/booth/prospects': ({ me }) => ({
      prospects: profiles.filter((p) => p.kind === 'attendee' && p.openToBooths && !meetingOf(me.id, p.id) && !shareOf(p.id, me.id)).map((p) => visitor(me.id, p.id)).filter((v) => v.card.common.length).sort((a, b) => b.fit - a.fit),
    }),
    'GET /api/discover': ({ me, q }) => {
      const query = q?.trim() || [...me.interests, me.stuckOn].filter(Boolean).join(', ')
      const ranked = <T extends { fit: number }>(items: T[]) => items.filter((i) => i.fit > 52).sort((a, b) => b.fit - a.fit)
      return {
        query,
        talks: ranked(talks.map((talk) => { const why = topicsFor(query, talk.topics); return { talk, why, fit: fitOf(why.length + (topicsFor(query, [talk.title]).length ? 1 : 0)) } })),
        booths: ranked(profiles.filter((p) => p.kind === 'sponsor' && p.id !== me.id).map((p) => { const why = topicsFor(query, p.interests); return { card: card(me.id, p.id), why, fit: fitOf(why.length) } })),
        people: ranked(profiles.filter((p) => p.kind === 'attendee' && p.discoverable && p.id !== me.id).map((p) => { const c = card(me.id, p.id); return { card: c, common: c.common, fit: fitOf(topicsFor(query, p.interests).length + c.common.length - 1) } })).slice(0, 6),
      }
    },
    'PUT /api/booths/:id/star': ({ me, id }) => (me.starred = [...new Set([...me.starred, id])], { starred: true }),
    'DELETE /api/booths/:id/star': ({ me, id }) => (me.starred = me.starred.filter((s) => s !== id), { starred: false }),
    'GET /api/pulse': ({ me }) => {
      const minute = Math.floor(Date.now() / 60000), terms = new Map<string, number>()
      profiles.forEach((p) => p.kind === 'attendee' && p.interests.forEach((t) => terms.set(t, (terms.get(t) ?? 0) + 17 + (t.length % 9))))
      const booths = profiles.filter((p) => p.kind === 'sponsor').map((p, i) => {
        const sent = requests.filter((r) => r.booth === p.id), won = sent.filter((r) => r.status === 'shared').length
        return { id: p.id, name: p.displayName, scans: 31 - i * 7 + meetings.filter((m) => m.scanners.has(p.id)).length, requests: 18 - i * 4 + sent.length, shared: 7 - i * 2 + won, shareRate: (7 - i * 2 + won) / (18 - i * 4 + sent.length), mutes: i + mutes.filter((x) => x.booth === p.id).length }
      })
      // A believable event already under way; everything done in the demo is added on top.
      const totals = { attendees: 200 + profiles.filter((p) => p.kind === 'attendee').length, booths: 14, meetings: 372 + meetings.length, shares: 131 + shares.length, unshares: 9 + unshares, requests: 88 + requests.length, shareRate: 0 }
      totals.shareRate = totals.shares / (totals.meetings + totals.requests)
      return {
        at: ago(0), totals,
        series: Array.from({ length: 30 }, (_, i) => {
          const m = minute - 29 + i, live = (type: string) => events.filter((e) => Math.floor(e.t / 60000) === m && e.type === type).length
          return { t: new Date(m * 60000).toISOString(), scans: 3 + ((m * 7) % 6) + live('scan') * 3, shares: 1 + ((m * 5) % 3) + live('share') * 3 }
        }),
        topInterests: [...terms].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count).slice(0, 6),
        booths: me.kind === 'organizer' ? booths : undefined,
        health: { source: 'dash0', p95Ms: 182 + (minute % 5) * 6, errorRate: 0.002, requestsPerMin: 640 + (minute % 7) * 12, slo: { name: 'Scan to card under 1s', target: 0.99, current: 0.997, ok: true }, dashboardUrl: 'https://app.dash0.com' },
      }
    },
    'GET /api/config': () => ({ dash0: { url: '', token: '' }, event: { name: 'Cloud Native Hackathon', endsAt: ago(-180) } }),
  }

  // Seed: Amara's afternoon so far, and the Elastic booth's.
  const [amara, elastic] = ['p500', 'p580']
  meet(amara, 'p502', ago(95)); meet('p503', amara, ago(80)); meet(amara, 'p504', ago(64)); meet('p504', amara, ago(63)); meet(amara, 'p505', ago(41)); meet('p506', amara, ago(33)); meet(amara, 'p510', ago(20)); meet('p509', amara, ago(12))
  meet('p501', 'p506', ago(50)); meet('p501', 'p511', ago(30))
  share('p502', amara, undefined, 'manual', undefined, ago(90)); share('p504', amara, undefined, 'manual', undefined, ago(60)); share(amara, 'p504', undefined, 'manual', undefined, ago(58)); share('p506', amara, ['email', 'github'], 'manual', undefined, ago(30))
  receipts.unshift({ id: 'r-open', owner: amara, type: 'opened', who: 'p504', fields: ['email', 'linkedin'], at: ago(52), traceId: trace() })
  ;['p502', 'p506', 'p505', 'p511', 'p508'].forEach((id, i) => meet(elastic, id, ago(70 - i * 9)))
  request(elastic, 'p506', by(elastic).pitch!, by(elastic).attachment, 'shared', 40)
  request(elastic, 'p502', 'Stop by for a sticker and a demo.', by(elastic).attachment, 'ignored', 35)
  request(elastic, 'p508', 'Stop by for a sticker and a demo.', by(elastic).attachment, 'pending', 22)
  share('p511', elastic, undefined, 'auto', undefined, ago(25))
  request('p581', amara, by('p581').pitch!, by('p581').attachment, 'pending', 6)
  if (demo === 'met' || demo === 'shared') meet(amara, 'p501')
  if (demo === 'shared') share('p501', amara)

  async function handle<K extends keyof Api>(token: string | null, key: K, opts: { body?: unknown; params?: { id: string }; query?: Record<string, string | undefined> } = {}): Promise<Api[K]['res']> {
    const me = profiles.find((p) => p.token === token)
    if (!me && key !== 'POST /api/me/signup' && key !== 'GET /api/config') throw new Error('Please sign in again.')
    return structuredClone((routes[key] as (c: Ctx<never>) => Api[K]['res'])({ me: me!, id: opts.params?.id ?? '', q: opts.query?.q, body: opts.body as never }))
  }
  return { handle }
}

/** The page's one shared server, so both Stage phones talk to the same event. `?demo=met|shared` fast-forwards the story. */
export const { handle } = createServer(typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('demo'))
