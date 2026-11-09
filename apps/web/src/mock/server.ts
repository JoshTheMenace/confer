import type { Api, Attachment, BoothGrant, Card, Common, ContactField, Lead, Me, Message, Receipt, Term, Thread, Visitor } from '../../../api/src/contract'
import { profiles, related, sampleCsv, talks } from './fixtures'

type Req<K extends keyof Api> = { params: Record<string, string>; body: Api[K] extends { body: infer B } ? B : undefined; query: Api[K] extends { query: infer Q } ? Q : undefined }
/** One conversation. `a` wrote first; `why` is frozen from `a`'s side; `seen` is how many messages each side has read. */
type Conv = { a: string; b: string; status: Thread['status']; why: Common[]; source: Thread['source']; attachment?: Attachment; msgs: { id: string; from: string; text: string; at: string }[]; seen: Record<string, number>; createdAt: string }
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
  const convs = new Map<string, Conv>() // by pair
  const receipts = new Map<string, Receipt[]>()
  const muted = new Set<string>() // `${who muted}>${sender}`
  const events: { t: number; type: 'scan' | 'share' | 'unshare' | 'request' }[] = []
  let seq = 0
  const iso = (back = 0) => new Date(now() - back).toISOString()
  const trace = () => Array.from({ length: 16 }, (_, i) => ((seq * 2654435761 + i * 40503) >>> (i % 5)).toString(16).slice(-1)).join('')
  const pair = (a: string, b: string) => [a, b].sort().join('|')
  const byTag = (tag: number) => [...people.values()].find((p) => p.tagId === tag)
  const get = (id: string) => { const p = people.get(id); if (!p) throw new Error('We could not find that person.'); return p }
  const fit = (c: Common[]) => Math.min(98, 35 + c.length * 21)
  const log = (owner: string, r: Omit<Receipt, 'id' | 'at' | 'traceId'>) => receipts.set(owner, [{ ...r, id: `r${++seq}`, at: iso(), traceId: trace() }, ...(receipts.get(owner) ?? [])])
  const flip = (common: Common[]) => common.map((c) => ({ ...c, mine: c.theirs, theirs: c.mine }))
  const unread = (me: string, c: Conv) => c.msgs.slice(c.seen[me] ?? 0).filter((m) => m.from !== me).length
  const message = (me: string, m: Conv['msgs'][number]): Message => ({ id: m.id, from: m.from === me ? 'me' : 'them', text: m.text, at: m.at })

  function card(viewer: Me, s: Me): Card {
    const meet = meets.get(pair(viewer.id, s.id)), conv = convs.get(pair(viewer.id, s.id))
    const theirs = shares.get(`${s.id}>${viewer.id}`), mine = shares.get(`${viewer.id}>${s.id}`)
    const booth = s.kind === 'sponsor', toBooth = viewer.kind === 'sponsor' && s.kind === 'attendee'
    return {
      id: s.id, tagId: s.tagId, kind: s.kind, approach: s.approach, pronouns: s.pronouns, commPref: s.commPref,
      name: toBooth && !s.boothsSeeName && !theirs ? null : s.displayName,
      common: !meet ? commonOf(viewer.interests, s.interests) : meet.first === viewer.id ? meet.common : flip(meet.common),
      met: meet && { at: meet.at, by: meet.by.size > 1 ? 'both' : meet.by.has(viewer.id) ? 'me' : 'them' },
      theyShared: theirs && { at: theirs.at, fields: theirs.fields, contact: Object.fromEntries(theirs.fields.map((f) => [f, s.contact[f]])), photo: s.photo, role: s.role },
      iShared: mine && { at: mine.at, fields: mine.fields },
      thread: conv && { status: conv.status, startedBy: conv.a === viewer.id ? 'me' : 'them', unread: unread(viewer.id, conv) },
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

  function share(me: Me, id: string, fields = me.shareFields, via?: Lead['via'], back = 0) {
    const s = get(id)
    // Sharing after the other side wrote first counts as won by their request.
    shares.set(`${me.id}>${id}`, { at: iso(back), fields, via: via ?? (convs.get(pair(me.id, id))?.a === id ? 'request' : 'manual') })
    if (!back) { events.push({ t: now(), type: 'share' }); log(me.id, { type: 'shared', who: card(me, s), fields }) }
    return card(me, s)
  }

  function thread(me: Me, c: Conv): Thread {
    const other = c.a === me.id ? c.b : c.a, last = message(me.id, c.msgs.at(-1)!)
    return {
      id: other, with: card(me, get(other)), status: c.status, startedBy: c.a === me.id ? 'me' : 'them', why: c.a === me.id ? c.why : flip(c.why), source: c.source, attachment: c.attachment,
      last: { text: last.text, at: last.at, from: last.from }, unread: unread(me.id, c), createdAt: c.createdAt, expiresAt: c.status === 'request' ? new Date(now() + 864e5).toISOString() : undefined,
    }
  }

  /** The first message is a request in the other person's inbox; a reply from them opens the chat. */
  function send(me: Me, to: string, text: string, attachment?: Attachment, back = 0) {
    const other = get(to), k = pair(me.id, to)
    if (!text.trim()) throw new Error('Write a line first.')
    if (muted.has(`${to}>${me.id}`)) throw new Error('They are not taking messages from you.')
    let c = convs.get(k)
    if (!c) {
      c = { a: me.id, b: to, status: 'request', why: card(me, other).common, source: meets.has(k) ? 'scan' : 'match', attachment, msgs: [], seen: {}, createdAt: iso(back) }
      convs.set(k, c)
      if (!back) events.push({ t: now(), type: 'request' })
    } else if (c.status !== 'open') {
      if (c.a === me.id) throw new Error('Your request is waiting for an answer.')
      c.status = 'open'
    }
    const m = { id: `m${++seq}`, from: me.id, text: text.trim(), at: iso(back) }
    c.msgs.push(m)
    c.seen[me.id] = c.msgs.length
    return { thread: thread(me, c), message: message(me.id, m) }
  }

  /** A booth's request is the same first message, plus the attachment. null: not sent. true: the attendee's settings shared right away. */
  function request(booth: Me, to: string, note: string, attachment = booth.attachment, back = 0) {
    const a = get(to)
    if (muted.has(`${to}>${booth.id}`) || convs.has(pair(to, booth.id))) return null
    send(booth, to, note, attachment, back)
    const auto = a.autoShare === 'matching' ? commonOf(a.interests, booth.interests).length >= 2 : a.autoShare === 'starred' && a.starred.includes(booth.id)
    if (auto) { share(a, booth.id, a.shareFields, 'auto', back); convs.get(pair(to, booth.id))!.status = 'open' }
    return auto
  }

  function answer(me: Me, id: string, action: Api['POST /api/chats/:id/answer']['body']['action'], fields?: ContactField[], back = 0) {
    const c = convs.get(pair(me.id, id))
    if (!c || c.b !== me.id) throw new Error('That request is no longer here.')
    c.status = action === 'accept' || action === 'share' ? 'open' : 'ignored'
    c.seen[me.id] = c.msgs.length
    if (action === 'share') share(me, id, fields?.length ? fields : me.shareFields, 'request', back)
    if (action === 'mute') muted.add(`${me.id}>${id}`)
    return thread(me, c)
  }

  const started = (me: Me) => [...convs.values()].filter((c) => c.a === me.id)
  const won = (c: Conv) => shares.has(`${c.b}>${c.a}`)
  const visitor = (booth: Me, a: Me, source: Visitor['source']): Visitor => {
    const c = card(booth, a), r = convs.get(pair(a.id, booth.id))
    return { card: c, fit: fit(c.common), source, scannedAt: c.met?.at, request: r?.a === booth.id ? { status: r.status, note: r.msgs[0].text, sentAt: r.createdAt } : undefined }
  }
  const attendees = () => [...people.values()].filter((p) => p.kind === 'attendee')
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const score = (q: string[], text: string[]) => { const t = words(text.join(' ')); return Math.min(97, 30 + 22 * q.filter((w) => t.some((x) => x.startsWith(w.slice(0, 5)))).length) }

  const routes: { [K in keyof Api]: (me: Me, r: Req<K>) => Api[K]['res'] } = {
    'POST /api/me/signup': (_, { body: { code, tagId = 520 + people.size, ...b } }) => {
      if (byTag(tagId)) throw new Error(`Badge ${tagId} already belongs to someone`)
      const me: Me = { ...b, id: `p${tagId}`, tagId, kind: code ? 'sponsor' : 'attendee', starred: [], hasPhoto: !!b.photo }
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
    'GET /api/inbox': (me) => {
      const all = [...convs.values()].filter((c) => c.a === me.id || c.b === me.id).map((c) => thread(me, c)).sort((x, y) => y.last.at.localeCompare(x.last.at))
      return { requests: all.filter((t) => t.status === 'request' && t.startedBy === 'them'), chats: all.filter((t) => t.status === 'open' || t.startedBy === 'me'), receipts: receipts.get(me.id) ?? [] }
    },
    'GET /api/chats/:id': (me, { params }) => {
      const c = convs.get(pair(me.id, params.id))
      if (!c) throw new Error('No conversation here yet.')
      c.seen[me.id] = c.msgs.length
      return { thread: thread(me, c), messages: c.msgs.map((m) => message(me.id, m)) }
    },
    'POST /api/chats/:id': (me, { params, body }) => send(me, params.id, body.text, body.attachment),
    'POST /api/chats/:id/answer': (me, { params, body }) => ({ thread: answer(me, params.id, body.action, body.fields) }),
    'GET /api/booth': (me) => {
      const mine = started(me), n = (s: Thread['status']) => mine.filter((c) => c.status === s && !won(c)).length, yes = mine.filter(won).length
      const leads: Lead[] = [...shares].filter(([k]) => k.endsWith(`>${me.id}`)).map(([k, s]) => {
        const a = get(k.split('>')[0])
        return { card: card(me, a), sharedAt: s.at, via: s.via, note: mine.find((c) => c.b === a.id)?.msgs[0].text }
      }).sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
      const visitors = attendees().filter((a) => meets.has(pair(a.id, me.id))).map((a) => visitor(me, a, 'scan')).sort((a, b) => b.fit - a.fit)
      const notes = [...new Set(mine.map((c) => c.msgs[0].text))].map((note) => { const all = mine.filter((c) => c.msgs[0].text === note), shared = all.filter(won).length; return { note, sent: all.length, shared, rate: shared / all.length } })
      return { leads, visitors, stats: { scans: visitors.length, requests: mine.length, pending: n('request'), shared: yes, ignored: n('ignored'), shareRate: mine.length ? yes / mine.length : 0, contentDelivered: mine.filter((c) => c.attachment).length, topInterests: top(visitors.map((v) => v.card.interests ?? [])), notes } }
    },
    'POST /api/booth/requests': (me, { body }) => {
      const sent = body.to.map((to) => request(me, to, body.note, body.attachment))
      return { sent: sent.filter((s) => s !== null).length, autoShared: sent.filter(Boolean).length }
    },
    'GET /api/booth/prospects': (me) => ({
      prospects: attendees().filter((a) => a.openToBooths && !meets.has(pair(a.id, me.id))).map((a) => visitor(me, a, 'match')).filter((v) => v.card.common.length).sort((a, b) => b.fit - a.fit),
    }),
    'GET /api/booth/export': (me) => {
      for (const [k, s] of shares) if (k.endsWith(`>${me.id}`)) log(k.split('>')[0], { type: 'exported', who: card(get(k.split('>')[0]), me), fields: s.fields })
      return sampleCsv
    },
    'GET /api/booth/grants': (me) => ({
      grants: [...shares].filter(([k]) => k.endsWith(`>${me.id}`)).map(([k, s]): BoothGrant => ({ attendeeId: k.split('>')[0], namespace: `booth-seed-${me.tagId}`, binding: `contact-seed-${k.split('>')[0].slice(1)}`, verbs: [...s.fields.map((f) => `read-${f}`), 'export'], kubernetes: 'allowed' })),
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
        const mine = started(b), shared = mine.filter(won).length
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

  // A lived-in event: Amara has met eight people and has two message requests waiting (Kwame, and the Dash0 booth with its kit);
  // Elastic has leads and a pitch history. Amara and Diego have not met: that is the demo.
  const p = (tag: number) => people.get(`p${tag}`)!
  const H = 36e5
  ;[502, 503, 505, 506, 509].forEach((t, i) => scan(p(500), [t], (i + 1) * H / 2))
  ;[504, 507, 511].forEach((t, i) => scan(p(t), [500], (i + 2) * H / 3))
  ;[503, 509, 511].forEach((t) => share(p(t), 'p500', undefined, 'manual', H / 4))
  share(p(500), 'p503', undefined, 'manual', H / 5)
  send(p(500), 'p503', 'Your on-call rota idea stuck with me. Can I steal it?', undefined, H / 5)
  send(p(503), 'p500', 'Steal away. I will send the doc after lunch.', undefined, H / 6)
  convs.get(pair('p500', 'p503'))!.seen.p500 = 2 // Amara has read Tomasz's reply
  ;[502, 510].forEach((t) => scan(p(501), [t], H))
  ;[502, 505, 506, 509, 510].forEach((t) => scan(p(580), [t], H))
  ;[505, 509, 510].forEach((t) => request(p(580), `p${t}`, p(580).pitch!, undefined, H / 2))
  request(p(580), 'p506', 'Stop by for a sticker and a demo.', undefined, H / 2)
  ;[505, 509].forEach((t) => answer(p(t), 'p580', 'share', undefined, H / 3))
  answer(p(506), 'p580', 'ignore')
  send(p(505), 'p500', 'We both run OpenTelemetry on Kubernetes. How do you sample traces?', undefined, H / 3)
  request(p(581), 'p500', p(581).pitch!, undefined, H / 2)
  receipts.set('p500', [
    { id: 'r0b', type: 'opened', who: card(p(500), p(503)), fields: ['email', 'linkedin'], at: iso(H / 6), traceId: '9c41e07ab2d15f36' },
    { id: 'r0a', type: 'shared', who: card(p(500), p(503)), fields: ['email', 'linkedin'], at: iso(H / 5), traceId: '4be7a90c13f8d2a6' },
  ])

  /** Deep-link states for screenshots and rehearsal: each step includes the ones before it. */
  const demo = (step: string) => {
    const at = ['met', 'asked', 'chat', 'shared', 'both', 'booth', 'lead'].indexOf(step)
    if (at >= 0) scan(p(500), [501])
    if (at >= 1) send(p(500), 'p501', 'Your Distributed tracing meets my OpenTelemetry. Swap stories?')
    if (at >= 2) send(p(501), 'p500', 'Yes. Find me by the coffee after this talk?')
    if (at >= 3) share(p(501), 'p500')
    if (at >= 4) share(p(500), 'p501')
    if (at >= 5) { scan(p(580), [500]); request(p(580), 'p500', p(580).pitch!) }
    if (at >= 6) answer(p(500), 'p580', 'share')
  }

  const call = <K extends keyof Api>(token: string | null, key: K, r: Partial<Req<K>> = {}): Api[K]['res'] => {
    const me = byTag(Number(token?.replace('demo-', '')))
    if (!me && key !== 'POST /api/me/signup' && key !== 'GET /api/config') throw new Error('Please sign in again.')
    return structuredClone(routes[key](me!, { params: {}, body: undefined, query: undefined, ...r } as Req<K>))
  }
  return { call, demo }
}

export const mock = createMock()
