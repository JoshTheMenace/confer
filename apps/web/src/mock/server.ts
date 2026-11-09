import type { Api, BoothRequest, Card, Common, ContactField, Lead, Me, Receipt, Term, Visitor } from '../../../api/src/contract'
import { profiles, related, talks } from './fixtures'

type Req<K extends keyof Api> = { params: Record<string, string>; body: Api[K] extends { body: infer B } ? B : undefined; query: Api[K] extends { query: infer Q } ? Q : undefined }
type Stored = BoothRequest & { to: string; from: string }
type Share = { at: string; fields: ContactField[]; via: Lead['via'] }
type Meet = { at: string; by: Set<string>; first: string; common: Common[] } // common is frozen from `first`'s side

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
/** Things two tag lists have in common: equal tags first, then related pairs. */
export function commonOf(mine: string[], theirs: string[]): Common[] {
  const out: Common[] = mine.filter((m) => theirs.some((t) => same(m, t))).map((m) => ({ kind: 'same', mine: m, theirs: m }))
  for (const [a, b] of related)
    for (const [m, t] of [[a, b], [b, a]])
      if (mine.some((x) => same(x, m)) && theirs.some((x) => same(x, t)) && !out.some((c) => c.mine === m || c.theirs === t)) out.push({ kind: 'related', mine: m, theirs: t })
  return out
}
const top = (lists: string[][]): Term[] => {
  const n = new Map<string, number>()
  lists.flat().forEach((t) => n.set(t, (n.get(t) ?? 0) + 1))
  return [...n].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count).slice(0, 6)
}

/** An in-memory Confer API: every contract route, with real state. `now` is injectable for tests. */
export function createMock(now: () => number = Date.now) {
  const people = new Map(profiles().map((p) => [p.id, p]))
  const meets = new Map<string, Meet>()
  const shares = new Map<string, Share>() // `${from}>${to}`
  const requests: Stored[] = []
  const receipts = new Map<string, Receipt[]>()
  const muted = new Set<string>() // `${attendee}>${booth}`
  const events: { t: number; type: 'scan' | 'share' | 'unshare' | 'request' }[] = []
  let seq = 0
  const iso = (back = 0) => new Date(now() - back).toISOString()
  const trace = () => Array.from({ length: 16 }, (_, i) => ((seq * 2654435761 + i * 40503) >>> (i % 5)).toString(16).slice(-1)).join('')
  const pair = (a: string, b: string) => [a, b].sort().join('|')
  const byTag = (tag: number) => [...people.values()].find((p) => p.tagId === tag)
  const get = (id: string) => { const p = people.get(id); if (!p) throw new Error('We could not find that person.'); return p }
  const fit = (c: Common[]) => Math.min(98, 35 + c.length * 21)
  const log = (owner: string, r: Omit<Receipt, 'id' | 'at' | 'traceId'>) => receipts.set(owner, [{ ...r, id: `r${++seq}`, at: iso(), traceId: trace() }, ...(receipts.get(owner) ?? [])])

  function card(viewer: Me, s: Me): Card {
    const meet = meets.get(pair(viewer.id, s.id))
    const theirs = shares.get(`${s.id}>${viewer.id}`), mine = shares.get(`${viewer.id}>${s.id}`)
    const booth = s.kind === 'sponsor', toBooth = viewer.kind === 'sponsor' && s.kind === 'attendee'
    return {
      id: s.id, tagId: s.tagId, kind: s.kind, approach: s.approach, pronouns: s.pronouns, commPref: s.commPref,
      name: toBooth && !s.boothsSeeName && !theirs ? null : s.displayName,
      common: !meet ? commonOf(viewer.interests, s.interests) : meet.first === viewer.id ? meet.common : meet.common.map((c) => ({ ...c, mine: c.theirs, theirs: c.mine })),
      met: meet && { at: meet.at, by: meet.by.size > 1 ? 'both' : meet.by.has(viewer.id) ? 'me' : 'them' },
      theyShared: theirs && { at: theirs.at, fields: theirs.fields, contact: Object.fromEntries(theirs.fields.map((f) => [f, s.contact[f]])), photo: s.photo, role: s.role },
      iShared: mine && { at: mine.at, fields: mine.fields },
      ...(booth && { role: s.role, interests: s.interests, about: s.about, pitch: s.pitch, attachment: s.attachment, starred: viewer.starred.includes(s.id), muted: muted.has(`${viewer.id}>${s.id}`) }),
      ...(toBooth && { interests: s.interests, stuckOn: s.openToBooths ? s.stuckOn : undefined }),
    }
  }

  function scan(me: Me, tagIds: number[], back = 0) {
    return tagIds.map(byTag).filter((p): p is Me => !!p && p.id !== me.id).map((p) => {
      const k = pair(me.id, p.id), m = meets.get(k) ?? { at: iso(back), by: new Set<string>(), first: me.id, common: commonOf(me.interests, p.interests) }
      m.by.add(me.id)
      meets.set(k, m)
      if (!back) events.push({ t: now(), type: 'scan' })
      return card(me, p)
    })
  }

  function share(me: Me, id: string, fields = me.shareFields, via: Lead['via'] = 'manual', back = 0) {
    const s = get(id)
    shares.set(`${me.id}>${id}`, { at: iso(back), fields, via })
    if (!back) { events.push({ t: now(), type: 'share' }); log(me.id, { type: 'shared', who: card(me, s), fields }) }
    return card(me, s)
  }

  function request(booth: Me, to: string, note: string, attachment = booth.attachment, back = 0) {
    const a = get(to)
    if (muted.has(`${to}>${booth.id}`)) return false
    const auto = a.autoShare === 'matching' ? commonOf(a.interests, booth.interests).length >= 2 : a.autoShare === 'starred' && a.starred.includes(booth.id)
    requests.unshift({ id: `q${++seq}`, to, from: booth.id, booth: card(a, booth), note, attachment, why: commonOf(a.interests, booth.interests), status: auto ? 'shared' : 'pending', source: meets.has(pair(to, booth.id)) ? 'scan' : 'match', createdAt: iso(back), expiresAt: new Date(now() + 864e5).toISOString() })
    if (auto) share(a, booth.id, a.shareFields, 'auto', back)
    if (!back) events.push({ t: now(), type: 'request' })
    return auto
  }

  const visitor = (booth: Me, a: Me, source: Visitor['source']): Visitor => {
    const c = card(booth, a), r = requests.find((q) => q.to === a.id && q.from === booth.id)
    return { card: c, fit: fit(c.common), source, scannedAt: c.met?.at, request: r && { status: r.status, note: r.note, sentAt: r.createdAt } }
  }
  const attendees = () => [...people.values()].filter((p) => p.kind === 'attendee')
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const score = (q: string[], text: string[]) => { const t = words(text.join(' ')); return Math.min(97, 30 + 22 * q.filter((w) => t.some((x) => x.startsWith(w.slice(0, 5)))).length) }

  const routes: { [K in keyof Api]: (me: Me, r: Req<K>) => Api[K]['res'] } = {
    'POST /api/me/signup': (_, { body: { code, ...b } }) => {
      const tagId = 520 + people.size, me: Me = { ...b, id: `p${tagId}`, tagId, kind: code ? 'sponsor' : 'attendee', starred: [], hasPhoto: !!b.photo }
      people.set(me.id, me)
      return { token: `demo-${tagId}`, me }
    },
    'GET /api/me': (me) => ({ me }),
    'PATCH /api/me': (me, { body }) => ({ me: Object.assign(me, body, body.photo !== undefined && { photo: body.photo || undefined, hasPhoto: !!body.photo }) }),
    'POST /api/scan': (me, { body }) => ({ cards: scan(me, body.tagIds) }),
    'GET /api/people': (me) => ({
      people: [...meets].filter(([k]) => k.split('|').includes(me.id)).sort((a, b) => b[1].at.localeCompare(a[1].at))
        .map(([k]) => card(me, get(k.split('|').find((id) => id !== me.id)!))),
    }),
    'POST /api/people/:id/share': (me, { params, body }) => ({ card: share(me, params.id, body.fields?.length ? body.fields : undefined) }),
    'DELETE /api/people/:id/share': (me, { params }) => {
      const had = shares.get(`${me.id}>${params.id}`)
      if (!had) throw new Error('You have not shared with this person.')
      shares.delete(`${me.id}>${params.id}`)
      events.push({ t: now(), type: 'unshare' })
      log(me.id, { type: 'unshared', who: card(me, get(params.id)), fields: had.fields })
      return { card: card(me, get(params.id)), receipt: receipts.get(me.id)![0] }
    },
    'POST /api/people/share': (me, { body }) => ({ shared: body.ids.filter((id) => !shares.has(`${me.id}>${id}`)).map((id) => share(me, id)).length }),
    'GET /api/inbox': (me) => ({ requests: requests.filter((q) => q.to === me.id).map(({ to: _to, from, ...q }) => ({ ...q, booth: card(me, get(from)) })), receipts: receipts.get(me.id) ?? [] }),
    'POST /api/inbox/:id': (me, { params, body }) => {
      const q = requests.find((x) => x.id === params.id && x.to === me.id)
      if (!q) throw new Error('That request is no longer here.')
      q.status = body.action === 'share' ? 'shared' : 'ignored'
      if (body.action === 'share') share(me, q.from, body.fields ?? me.shareFields, 'request')
      if (body.action === 'mute') muted.add(`${me.id}>${q.from}`)
      const { to: _to, from, ...rest } = q
      return { request: { ...rest, booth: card(me, get(from)) } }
    },
    'GET /api/booth': (me) => {
      const mine = requests.filter((q) => q.from === me.id), n = (s: BoothRequest['status']) => mine.filter((q) => q.status === s).length
      const leads: Lead[] = [...shares].filter(([k]) => k.endsWith(`>${me.id}`)).map(([k, s]) => {
        const a = get(k.split('>')[0])
        return { card: card(me, a), sharedAt: s.at, via: s.via, note: mine.find((q) => q.to === a.id && q.status === 'shared')?.note }
      }).sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
      const visitors = attendees().filter((a) => meets.has(pair(a.id, me.id))).map((a) => visitor(me, a, 'scan')).sort((a, b) => b.fit - a.fit)
      const notes = [...new Set(mine.map((q) => q.note))].map((note) => { const all = mine.filter((q) => q.note === note), won = all.filter((q) => q.status === 'shared').length; return { note, sent: all.length, shared: won, rate: won / all.length } })
      return { leads, visitors, stats: { scans: visitors.length, requests: mine.length, pending: n('pending'), shared: n('shared'), ignored: n('ignored'), shareRate: mine.length ? n('shared') / mine.length : 0, contentDelivered: mine.filter((q) => q.attachment).length, topInterests: top(visitors.map((v) => v.card.interests ?? [])), notes } }
    },
    'POST /api/booth/requests': (me, { body }) => {
      const sent = body.to.map((to) => request(me, to, body.note, body.attachment))
      return { sent: sent.filter((s) => s !== false).length, autoShared: sent.filter(Boolean).length }
    },
    'GET /api/booth/prospects': (me) => ({
      prospects: attendees().filter((a) => a.openToBooths && !meets.has(pair(a.id, me.id))).map((a) => visitor(me, a, 'match')).filter((v) => v.card.common.length).sort((a, b) => b.fit - a.fit),
    }),
    'GET /api/discover': (me, { query }) => {
      const text = query?.q?.trim() || [...me.interests, me.stuckOn ?? ''].join(' '), q = words(text)
      const hits = (topics: string[]) => topics.filter((t) => q.some((w) => words(t).some((x) => x.startsWith(w.slice(0, 5)))))
      const ranked = <T extends { fit: number }>(xs: T[]) => xs.filter((x) => x.fit > 30).sort((a, b) => b.fit - a.fit).slice(0, 4)
      return {
        query: text,
        talks: ranked(talks.map((talk) => ({ talk, fit: score(q, [talk.title, talk.abstract, ...talk.topics]), why: hits(talk.topics) }))),
        booths: ranked([...people.values()].filter((p) => p.kind === 'sponsor').map((b) => ({ card: card(me, b), fit: score(q, [b.about ?? '', ...b.interests]), why: hits(b.interests) }))),
        people: ranked(attendees().filter((a) => a.id !== me.id && a.discoverable).map((a) => { const c = card(me, a); return { card: c, fit: score(q, [...a.interests, ...c.common.map((x) => x.theirs)]) - (c.common.length ? 0 : 60), common: c.common } })),
      }
    },
    'PUT /api/booths/:id/star': (me, { params }) => { if (!me.starred.includes(params.id)) me.starred.push(params.id); return { starred: true } },
    'DELETE /api/booths/:id/star': (me, { params }) => { me.starred = me.starred.filter((id) => id !== params.id); return { starred: false } },
    'GET /api/pulse': (me) => {
      const n = (t: string) => events.filter((e) => e.type === t).length, minute = Math.floor(now() / 6e4)
      const booths = [...people.values()].filter((p) => p.kind === 'sponsor').map((b) => {
        const mine = requests.filter((q) => q.from === b.id), shared = mine.filter((q) => q.status === 'shared').length
        return { id: b.id, name: b.displayName, scans: 14 + [...meets.keys()].filter((k) => k.includes(b.id)).length, requests: 9 + mine.length, shared: 4 + shared, shareRate: (4 + shared) / (9 + mine.length), mutes: [...muted].filter((k) => k.endsWith(b.id)).length }
      })
      return {
        at: iso(),
        totals: { attendees: 212, booths: 3, meetings: 486 + n('scan'), shares: 203 + n('share'), unshares: 11 + n('unshare'), requests: 96 + n('request'), shareRate: (203 + n('share')) / (486 + n('scan')) },
        // A believable event curve; the last bar is what happened in this session.
        series: Array.from({ length: 30 }, (_, i) => ({ t: new Date((minute - 29 + i) * 6e4).toISOString(), scans: i === 29 ? 3 + n('scan') * 4 : 6 + ((i * 7) % 9) + Math.round(4 * Math.sin(i / 3)), shares: i === 29 ? 1 + n('share') * 4 : 2 + ((i * 5) % 6) })),
        topInterests: top(attendees().map((a) => a.interests)),
        booths: me.kind === 'organizer' ? booths : undefined,
        health: { source: 'dash0', p95Ms: 182, errorRate: 0.002, requestsPerMin: 340 + events.length, slo: { name: 'Scan to card under 1s', target: 0.99, current: 0.996, ok: true }, dashboardUrl: 'https://app.dash0.com' },
      }
    },
    'GET /api/config': () => ({ dash0: { url: '', token: '' }, event: { name: 'Merge Forward 2026', endsAt: new Date(now() + 6 * 36e5).toISOString() } }),
  }

  // A lived-in event: Amara has met eight people, four shared with her; Elastic has leads and a pitch history.
  const p = (tag: number) => people.get(`p${tag}`)!
  const H = 36e5
  ;[502, 503, 505, 506, 509].forEach((t, i) => scan(p(500), [t], (i + 1) * H / 2))
  ;[504, 507, 511].forEach((t, i) => scan(p(t), [500], (i + 2) * H / 3))
  ;[503, 505, 509, 511].forEach((t) => share(p(t), 'p500', undefined, 'manual', H / 4))
  share(p(500), 'p503', undefined, 'manual', H / 5)
  ;[502, 510].forEach((t) => scan(p(501), [t], H))
  ;[502, 505, 506, 509, 510].forEach((t) => scan(p(580), [t], H))
  ;[505, 509, 510].forEach((t) => request(p(580), `p${t}`, p(580).pitch!, undefined, H / 2))
  request(p(580), 'p506', 'Stop by for a sticker and a demo.', undefined, H / 2)
  ;[505, 509].forEach((t) => { requests.find((q) => q.to === `p${t}`)!.status = 'shared'; share(p(t), 'p580', undefined, 'request', H / 3) })
  requests.find((q) => q.to === 'p506')!.status = 'ignored'
  request(p(581), 'p500', p(581).pitch!, undefined, 2 * H)
  receipts.set('p500', [
    { id: 'r0b', type: 'opened', who: card(p(500), p(503)), fields: ['email', 'linkedin'], at: iso(H / 6), traceId: '9c41e07ab2d15f36' },
    { id: 'r0a', type: 'shared', who: card(p(500), p(503)), fields: ['email', 'linkedin'], at: iso(H / 5), traceId: '4be7a90c13f8d2a6' },
  ])

  /** Deep-link states for screenshots and rehearsal: each step includes the ones before it. */
  const demo = (step: string) => {
    const at = ['met', 'shared', 'both', 'request'].indexOf(step)
    if (at >= 0) scan(p(500), [501])
    if (at >= 1) share(p(501), 'p500')
    if (at >= 2) share(p(500), 'p501')
    if (at >= 3) { scan(p(580), [500]); request(p(580), 'p500', p(580).pitch!) }
  }

  const call = <K extends keyof Api>(token: string | null, key: K, r: Partial<Req<K>> = {}): Api[K]['res'] => {
    const me = byTag(Number(token?.replace('demo-', '')))
    if (!me && key !== 'POST /api/me/signup' && key !== 'GET /api/config') throw new Error('Please sign in again.')
    return structuredClone(routes[key](me!, { params: {}, body: undefined, query: undefined, ...r } as Req<K>))
  }
  return { call, demo }
}

export const mock = createMock()
