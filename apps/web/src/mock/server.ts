import type { Api, Attachment, BoothRequest, Card, Common, ContactField, Discover, Lead, Me, Pulse, Receipt, Term, Visitor } from '../../../api/src/contract'
import { related, seedRows, talks, tokens } from './fixtures'

type Meet = { a: string; b: string; at: string; by: string[]; common: Common[] } // common is from a's side
type Share = { from: string; to: string; at: string; fields: ContactField[]; via: Lead['via']; note?: string; opened?: boolean }
type Req = Omit<BoothRequest, 'booth' | 'why'> & { from: string; to: string }
type Rec = Omit<Receipt, 'who'> & { owner: string; whoId: string }
type Ctx<K extends keyof Api> = { me: string; id: string; body: Api[K] extends { body: infer B } ? B : undefined; query: Api[K] extends { query: infer Q } ? Q : undefined }
type Loose = { params?: Record<string, string>; body?: unknown; query?: unknown }

const low = (s: string) => s.toLowerCase()
const pct = (n: number, d: number) => (d ? n / d : 0)
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const top = (lists: string[][]): Term[] =>
  [...lists.flat().reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string, number>())].map(([term, count]) => ({ term, count })).sort((x, y) => y.count - x.count).slice(0, 6)

export function commonOf(mine: string[], theirs: string[]): Common[] {
  const has = (list: string[], t: string) => list.some((x) => low(x) === low(t))
  return [
    ...mine.filter((m) => has(theirs, m)).map((m) => ({ kind: 'same' as const, mine: m, theirs: m })),
    ...related.flatMap(([x, y]) => [[x, y], [y, x]]).filter(([m, t]) => has(mine, m) && has(theirs, t) && !has(mine, t) && !has(theirs, m)).map(([m, t]) => ({ kind: 'related' as const, mine: m, theirs: t })),
  ]
}

/** An in-memory Confer API. `seed`: 'met' (Amara scanned Diego) or 'shared' (and Diego shared back), for deep links. */
export function createMock(seed?: string | null) {
  const rows = new Map(seedRows().map((r) => [r.p.id, r]))
  const byToken = new Map(Object.entries(tokens))
  const meets: Meet[] = [], shares: Share[] = [], reqs: Req[] = [], recs: Rec[] = [], mutes = new Set<string>()
  const events: { kind: 'scan' | 'share' | 'unshare' | 'request'; at: number }[] = []
  let n = 0
  const ago = (min = 0) => new Date(Date.now() - min * 60000).toISOString()
  const trace = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const row = (id: string) => { const r = rows.get(id); if (!r) throw new Error('Nobody here has that badge.'); return r }
  const meet = (a: string, b: string) => meets.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a))
  const shared = (from: string, to: string) => shares.find((s) => s.from === from && s.to === to)
  const fit = (a: string, b: string) => Math.min(97, 38 + commonOf(row(a).p.interests, row(b).p.interests).length * 19 + (hash(a + b) % 9))
  const log = (owner: string, whoId: string, type: Receipt['type'], fields: ContactField[], at: string) => { const r = { id: `r${++n}`, owner, whoId, type, fields, at, traceId: trace() }; recs.unshift(r); return r }
  const meOf = (id: string): Me => ({ ...row(id).p, contact: row(id).contact, photo: row(id).photo })

  function card(v: string, s: string): Card {
    const { p, contact, photo } = row(s), viewer = row(v).p, m = meet(v, s), they = shared(s, v), mine = shared(v, s)
    return {
      id: p.id, tagId: p.tagId, kind: p.kind, pronouns: p.pronouns, approach: p.approach, commPref: p.commPref,
      name: viewer.kind !== 'sponsor' || p.kind !== 'attendee' || p.boothsSeeName || they ? p.displayName : null,
      common: m ? (m.a === v ? m.common : m.common.map((c) => ({ ...c, mine: c.theirs, theirs: c.mine }))) : commonOf(viewer.interests, p.interests),
      met: m && { at: m.at, by: m.by.length > 1 ? 'both' : m.by[0] === v ? 'me' : 'them' },
      theyShared: they && { at: they.at, fields: they.fields, contact: Object.fromEntries(they.fields.map((f) => [f, contact[f]])), photo, role: p.role },
      iShared: mine && { at: mine.at, fields: mine.fields },
      ...(p.kind === 'sponsor' ? { role: p.role, interests: p.interests, about: p.about, pitch: p.pitch, attachment: p.attachment, starred: viewer.starred.includes(s), muted: mutes.has(`${v}:${s}`) } : {}),
      ...(viewer.kind === 'sponsor' && p.kind === 'attendee' ? { interests: p.interests, stuckOn: p.openToBooths ? p.stuckOn : undefined } : {}),
    }
  }
  function scan(me: string, other: string, at = ago()) {
    let m = meet(me, other)
    if (!m) meets.push((m = { a: me, b: other, at, by: [], common: commonOf(row(me).p.interests, row(other).p.interests) }))
    if (!m.by.includes(me)) m.by.push(me)
    events.push({ kind: 'scan', at: Date.now() })
  }
  function share(from: string, to: string, fields = row(from).p.shareFields, via: Lead['via'] = 'manual', note?: string, at = ago()) {
    const old = shared(from, to)
    if (old) shares.splice(shares.indexOf(old), 1)
    shares.push({ from, to, at, fields, via, note })
    log(from, to, 'shared', fields, at)
    events.push({ kind: 'share', at: Date.now() })
  }
  function unshare(from: string, to: string): Receipt {
    const s = shared(from, to)
    if (!s) throw new Error('Nothing is shared with them.')
    shares.splice(shares.indexOf(s), 1)
    events.push({ kind: 'unshare', at: Date.now() })
    const { owner: _, whoId, ...r } = log(from, to, 'unshared', s.fields, ago())
    return { ...r, who: card(from, whoId) }
  }
  function request(from: string, to: string, note: string, attachment?: Attachment, status: Req['status'] = 'pending', at = ago()) {
    const r: Req = { id: `q${++n}`, from, to, note, attachment, status, source: meet(from, to) ? 'scan' : 'match', createdAt: at, expiresAt: new Date(Date.parse(at) + 864e5).toISOString() }
    reqs.unshift(r)
    events.push({ kind: 'request', at: Date.now() })
    return r
  }
  const reqOut = ({ from, to, ...r }: Req): BoothRequest => ({ ...r, booth: card(to, from), why: commonOf(row(to).p.interests, row(from).p.interests) })
  const visitor = (me: string, o: string, source: Visitor['source']): Visitor => {
    const r = reqs.find((q) => q.from === me && q.to === o)
    return { card: card(me, o), fit: fit(me, o), source, scannedAt: meet(me, o)?.at, request: r && { status: r.status, note: r.note, sentAt: r.createdAt } }
  }

  function discover(me: string, q?: string): Discover {
    const p = row(me).p
    const query = q?.trim() || [...p.interests, p.stuckOn].filter(Boolean).join(', ')
    const words = low(query).split(/[^a-z0-9]+/).filter((w) => w.length > 3)
    const all = [...new Set([...rows.values()].flatMap((r) => r.p.interests).concat(talks.flatMap((t) => t.topics)))]
    const direct = all.filter((t) => words.some((w) => low(t).includes(w.replace(/s$/, ''))))
    const wide = new Set([...direct, ...related.flatMap(([x, y]) => (direct.includes(x) ? [y] : direct.includes(y) ? [x] : []))])
    const why = (topics: string[]) => topics.filter((t) => wide.has(t))
    const score = (hits: number, salt: string) => Math.min(98, 52 + hits * 15 + (hash(salt) % 8))
    const others = [...rows.values()].filter((r) => r.p.id !== me && r.p.discoverable)
    const rank = <T extends { fit: number }>(list: T[]) => list.sort((x, y) => y.fit - x.fit)
    return {
      query,
      talks: rank(talks.filter((t) => why(t.topics).length).map((t) => ({ talk: t, fit: score(why(t.topics).length, t.id), why: why(t.topics) }))),
      booths: rank(others.filter((r) => r.p.kind === 'sponsor' && why(r.p.interests).length).map((r) => ({ card: card(me, r.p.id), fit: score(why(r.p.interests).length, r.p.id), why: why(r.p.interests) }))),
      people: rank(others.filter((r) => r.p.kind === 'attendee' && why(r.p.interests).length && commonOf(p.interests, r.p.interests).length).map((r) => ({ card: card(me, r.p.id), fit: score(why(r.p.interests).length, r.p.id), common: commonOf(p.interests, r.p.interests) }))),
    }
  }

  function boothStats(me: string) {
    const mine = reqs.filter((r) => r.from === me), won = mine.filter((r) => r.status === 'shared').length
    const scanned = meets.filter((m) => m.by.includes(me)).map((m) => (m.a === me ? m.b : m.a))
    return {
      scans: scanned.length, requests: mine.length, pending: mine.filter((r) => r.status === 'pending').length, shared: won, ignored: mine.filter((r) => r.status === 'ignored').length,
      shareRate: pct(won, mine.length), contentDelivered: mine.filter((r) => r.attachment).length, topInterests: top(scanned.map((id) => row(id).p.interests)),
      notes: [...new Set(mine.map((r) => r.note))].map((note) => { const sent = mine.filter((r) => r.note === note), ok = sent.filter((r) => r.status === 'shared').length; return { note, sent: sent.length, shared: ok, rate: pct(ok, sent.length) } }),
    }
  }

  function pulse(organizer: boolean): Pulse {
    const live = (k: string, minute?: number) => events.filter((e) => e.kind === k && (minute === undefined || Math.floor(e.at / 60000) === minute)).length
    const now = Math.floor(Date.now() / 60000), all = [...rows.values()]
    const totals = { attendees: 412, booths: 18, meetings: 1284 + live('scan'), shares: 731 + live('share'), unshares: 21 + live('unshare'), requests: 156 + live('request') }
    return {
      at: ago(),
      totals: { ...totals, shareRate: pct(totals.shares, totals.meetings) },
      series: Array.from({ length: 30 }, (_, i) => { const t = now - 29 + i, base = 16 + Math.round(8 * Math.sin(t / 4) + 4 * Math.sin(t / 1.7)); return { t: new Date(t * 60000).toISOString(), scans: base + live('scan', t), shares: Math.round(base * 0.55) + live('share', t) } }),
      topInterests: top(all.filter((r) => r.p.kind === 'attendee').map((r) => r.p.interests)).map((t) => ({ ...t, count: t.count * 31 })),
      booths: organizer ? all.filter((r) => r.p.kind === 'sponsor').map((r) => { const s = boothStats(r.p.id); return { id: r.p.id, name: r.p.displayName, scans: s.scans, requests: s.requests, shared: s.shared, shareRate: s.shareRate, mutes: [...mutes].filter((m) => m.endsWith(`:${r.p.id}`)).length } }) : undefined,
      health: { source: 'dash0', p95Ms: 182, errorRate: 0.002, requestsPerMin: 340 + events.length, slo: { name: 'Scan to card in under 1 second', target: 0.99, current: 0.997, ok: true }, dashboardUrl: 'https://app.dash0.com' },
    }
  }

  const handlers: { [K in keyof Api]: (c: Ctx<K>) => Api[K]['res'] } = {
    'POST /api/me/signup': ({ body: { contact, photo, code, ...input } }) => {
      const id = `p${++n}`, token = `mock-${id}`
      rows.set(id, { p: { ...input, id, tagId: 520 + n, kind: code ? 'sponsor' : 'attendee', starred: [], hasPhoto: !!photo }, contact, photo })
      byToken.set(token, id)
      return { token, me: meOf(id) }
    },
    'GET /api/me': ({ me }) => ({ me: meOf(me) }),
    'PATCH /api/me': ({ me, body: { contact, photo, ...input } }) => {
      const r = row(me)
      Object.assign(r.p, input)
      if (contact) r.contact = contact
      if (photo !== undefined) { r.photo = photo || undefined; r.p.hasPhoto = !!photo }
      return { me: meOf(me) }
    },
    'POST /api/scan': ({ me, body }) => ({
      cards: body.tagIds.flatMap((t) => { const o = [...rows.values()].find((r) => r.p.tagId === t && r.p.id !== me); if (!o) return []; scan(me, o.p.id); return [card(me, o.p.id)] }),
    }),
    'GET /api/people': ({ me }) => ({
      people: meets.filter((m) => m.a === me || m.b === me).sort((x, y) => y.at.localeCompare(x.at)).map((m) => {
        const o = m.a === me ? m.b : m.a, s = shared(o, me)
        if (s && !s.opened) { s.opened = true; log(o, me, 'opened', s.fields, ago()) }
        return card(me, o)
      }),
    }),
    'POST /api/people/:id/share': ({ me, id, body }) => { share(me, id, body.fields); return { card: card(me, id) } },
    'DELETE /api/people/:id/share': ({ me, id }) => { const receipt = unshare(me, id); return { card: card(me, id), receipt } },
    'POST /api/people/share': ({ me, body }) => { const ids = body.ids.filter((id) => !shared(me, id)); ids.forEach((id) => share(me, id)); return { shared: ids.length } },
    'GET /api/inbox': ({ me }) => ({ requests: reqs.filter((r) => r.to === me).map(reqOut), receipts: recs.filter((r) => r.owner === me).map(({ owner: _, whoId, ...r }) => ({ ...r, who: card(me, whoId) })) }),
    'POST /api/inbox/:id': ({ me, id, body }) => {
      const r = reqs.find((q) => q.id === id && q.to === me)
      if (!r) throw new Error('That request is gone.')
      r.status = body.action === 'share' ? 'shared' : 'ignored'
      if (body.action === 'share') share(me, r.from, body.fields, 'request', r.note)
      if (body.action === 'mute') mutes.add(`${me}:${r.from}`)
      return { request: reqOut(r) }
    },
    'GET /api/booth': ({ me }) => ({
      leads: shares.filter((s) => s.to === me).map((s) => ({ card: card(me, s.from), sharedAt: s.at, via: s.via, note: s.note })).reverse(),
      visitors: meets.filter((m) => m.a === me || m.b === me).map((m) => visitor(me, m.a === me ? m.b : m.a, 'scan')).filter((v) => v.card.kind === 'attendee' && !v.card.theyShared).sort((x, y) => y.fit - x.fit),
      stats: boothStats(me),
    }),
    'POST /api/booth/requests': ({ me, body }) => {
      let sent = 0, autoShared = 0
      for (const to of body.to) {
        if (mutes.has(`${to}:${me}`) || reqs.some((r) => r.from === me && r.to === to && r.status === 'pending')) continue
        const r = request(me, to, body.note, body.attachment), p = row(to).p
        sent++
        if ((p.autoShare === 'starred' && p.starred.includes(me)) || (p.autoShare === 'matching' && commonOf(p.interests, row(me).p.interests).length >= 2)) { r.status = 'shared'; share(to, me, undefined, 'auto', body.note); autoShared++ }
      }
      return { sent, autoShared }
    },
    'GET /api/booth/prospects': ({ me }) => ({
      prospects: [...rows.values()].filter((r) => r.p.kind === 'attendee' && r.p.openToBooths && !meet(me, r.p.id) && commonOf(row(me).p.interests, r.p.interests).length).map((r) => visitor(me, r.p.id, 'match')).sort((x, y) => y.fit - x.fit),
    }),
    'GET /api/discover': ({ me, query }) => discover(me, query.q),
    'PUT /api/booths/:id/star': ({ me, id }) => { const p = row(me).p; if (!p.starred.includes(id)) p.starred.push(id); return { starred: true } },
    'DELETE /api/booths/:id/star': ({ me, id }) => { const p = row(me).p; p.starred = p.starred.filter((x) => x !== id); return { starred: false } },
    'GET /api/pulse': ({ me }) => pulse(row(me).p.kind === 'organizer'),
    'GET /api/config': () => ({ dash0: { url: '', token: '' }, event: { name: 'Confer demo day', endsAt: new Date(Date.now() + 6 * 36e5).toISOString() } }),
  }

  // Fixture history: [scanner, scanned, minutes ago, who shared with whom].
  const history: [string, string, number, ...[string, string][]][] = [
    ['amara', 'priya', 190, ['priya', 'amara'], ['amara', 'priya']], ['priya', 'amara', 185], ['amara', 'tomas', 170], ['mei', 'amara', 150, ['mei', 'amara']],
    ['amara', 'kofi', 120, ['kofi', 'amara']], ['sana', 'amara', 96], ['amara', 'ife', 70, ['ife', 'amara']], ['rosa', 'amara', 44, ['rosa', 'amara']], ['amara', 'rosa', 43], ['amara', 'lars', 30],
    ['diego', 'noor', 140, ['noor', 'diego']], ['yuki', 'diego', 90], ['diego', 'kofi', 60], ['diego', 'mei', 35, ['mei', 'diego']],
    ['elastic', 'mei', 110], ['elastic', 'kofi', 100], ['elastic', 'ife', 80], ['elastic', 'yuki', 50], ['elastic', 'lars', 25], ['lumen', 'noor', 75], ['relay', 'rosa', 40],
  ]
  for (const [a, b, min, ...gave] of history) { scan(a, b, ago(min)); gave.forEach(([from, to]) => share(from, to, undefined, 'manual', undefined, ago(min - 2))) }
  const el = row('elastic').p, alt = 'Stuck on search relevance? Our hybrid search workbook is yours either way.'
  const sent: [string, string, string, Req['status'], number][] = [
    ['elastic', 'mei', el.pitch!, 'shared', 108], ['elastic', 'kofi', el.pitch!, 'ignored', 98], ['elastic', 'ife', el.pitch!, 'shared', 78], ['elastic', 'yuki', alt, 'pending', 48], ['elastic', 'lars', alt, 'shared', 24],
    ['lumen', 'noor', row('lumen').p.pitch!, 'shared', 70], ['lumen', 'amara', row('lumen').p.pitch!, 'pending', 12], ['relay', 'rosa', row('relay').p.pitch!, 'ignored', 38],
  ]
  for (const [from, to, note, status, min] of sent) { request(from, to, note, row(from).p.attachment, status, ago(min)); if (status === 'shared') share(to, from, undefined, to === 'lars' ? 'auto' : 'request', note, ago(min - 3)) }
  share('amara', 'tomas', undefined, 'manual', undefined, ago(160)); unshare('amara', 'tomas')
  shares.forEach((s) => (s.opened = true))
  if (seed === 'met' || seed === 'shared') scan('amara', 'diego')
  if (seed === 'shared') share('diego', 'amara')
  events.length = 0 // only what happens from here on moves the pulse

  return <K extends keyof Api>(token: string | undefined, key: K, { params, body, query }: Loose = {}): Api[K]['res'] => {
    const me = byToken.get(token ?? '')
    if (!me && key !== 'POST /api/me/signup' && key !== 'GET /api/config') throw Object.assign(new Error('Please sign in again.'), { status: 401 })
    return handlers[key]({ me: me ?? '', id: params?.id ?? '', body, query: query ?? {} } as Ctx<K>)
  }
}

let server: ReturnType<typeof createMock> | undefined
/** The shared instance behind `call()` in mock mode, with a little latency so loading states are real. */
export async function mock<K extends keyof Api>(token: string | undefined, key: K, o: Loose): Promise<Api[K]['res']> {
  await new Promise((r) => setTimeout(r, 60))
  server ??= createMock(new URLSearchParams(globalThis.location?.search).get('seed'))
  return server(token, key, o)
}
