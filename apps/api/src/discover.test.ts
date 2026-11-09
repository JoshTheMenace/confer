import { beforeEach, describe, expect, test, vi } from 'vitest'

const es = vi.hoisted(() => ({ get: vi.fn(), search: vi.fn(), msearch: vi.fn(), update: vi.fn(), index: vi.fn() }))
const ix = vi.hoisted(() => ({ talks: 't_talks', profiles: 't_profiles', meetings: 't_meetings', mutes: 't_mutes' }))
vi.mock('./es.js', () => ({ es, ix }))
const { discoverSearches, fit, prospectSearch, sameTags, toCard, toDiscover, toProspect, why } = await import('./discover.js')
const { booths, discover, prospects } = await import('./routes/discover.js')
const { talks } = await import('./talks.js')

const me = { id: 'me', interests: ['OpenTelemetry', 'eBPF'], lookingFor: ['mentoring'], stuckOn: 'tail latency', starred: ['b1'] }
const person = {
  tagId: 7, kind: 'attendee' as const, displayName: 'Viktor', pronouns: 'he/him', approach: 'ask' as const, commPref: 'text me',
  role: 'Backend Engineer', interests: ['opentelemetry', 'Kafka'], lookingFor: [], about: 'Trace context everywhere.', stuckOn: 'sampling',
  discoverable: true, openToBooths: true, boothsSeeName: false, autoShare: 'off' as const, shareFields: [], starred: [], hasPhoto: false,
}
const booth = { ...person, kind: 'sponsor' as const, displayName: 'Tracewise', interests: ['Distributed tracing'], about: 'Traces in one place.', pitch: 'Five minute demo', attachment: { url: 'https://example.com/g.pdf', label: 'Guide' } }
const hit = <T,>(_id: string, _source: T, extra = {}) => ({ _index: 'x', _id, _score: 2 / 61, _source, ...extra })
const secret = ['interests', 'role', 'about', 'stuckOn', 'lookingFor']

describe('discoverSearches', () => {
  const bodies = (q?: string) => { const { text, searches } = discoverSearches(me, q); return { text, searches, talks: searches[1] as any, booths: searches[3] as any, people: searches[5] as any } }

  test('one msearch body: talks, booths, people, each through `ix` and each a keyword + semantic rrf', () => {
    const b = bodies()
    expect(b.searches.filter((_, i) => i % 2 === 0)).toEqual([{ index: 't_talks' }, { index: 't_profiles' }, { index: 't_profiles' }])
    expect(b.text).toBe('OpenTelemetry eBPF mentoring tail latency')
    for (const [body, field] of [[b.talks, 'semantic'], [b.booths, 'about_semantic'], [b.people, 'peer_semantic']] as const) {
      const [keyword, semantic] = body.retriever.rrf.retrievers
      expect(keyword.standard.query.bool.must.bool.should[0].multi_match.query).toBe(b.text)
      expect(semantic.standard.query.bool.must).toEqual({ semantic: { field, query: b.text } })
    }
    expect(b.talks.retriever.rrf.retrievers[0].standard.query.bool.must.bool.should[1]).toEqual({ terms: { topics: me.interests, boost: 3 } })
    // People are searchable by topic tags only: never by what they wrote about themselves.
    expect(JSON.stringify(b.people)).not.toMatch(/about_semantic|"role"|"about"|stuckOn/)
  })
  test('free text reranks talks only, on the real abstract field', () => {
    const b = bodies(' tracing across 200 services ')
    expect(b.talks.retriever.text_similarity_reranker).toMatchObject({ field: 'abstract', inference_id: '.jina-reranker-v3', inference_text: 'tracing across 200 services', rank_window_size: 20 })
    expect(b.talks.retriever.text_similarity_reranker.retriever.rrf.retrievers).toHaveLength(2)
    expect(b.booths.retriever).toHaveProperty('rrf')
    expect(b.people.retriever).toHaveProperty('rrf')
    expect(JSON.stringify(b.searches)).not.toContain('mentoring') // the profile stays out of a free-text search
  })
  test('people: discoverable attendees only, never me, and no topic leaves Elasticsearch except interests (for `common`)', () => {
    for (const q of [undefined, 'tracing']) {
      const { people } = bodies(q)
      for (const { standard } of people.retriever.rrf.retrievers) {
        expect(standard.query.bool.filter).toEqual([{ term: { kind: 'attendee' } }, { term: { discoverable: true } }])
        expect(standard.query.bool.must_not).toEqual([{ ids: { values: ['me'] } }])
      }
      expect(people._source).toEqual(['tagId', 'kind', 'displayName', 'pronouns', 'approach', 'commPref', 'interests'])
      expect(people).not.toHaveProperty('highlight')
    }
  })
  test('booths are filtered to sponsors; an empty profile still gets scoped results', () => {
    expect(bodies().booths.retriever.rrf.retrievers[0].standard.query.bool.filter).toEqual([{ term: { kind: 'sponsor' } }])
    const empty = discoverSearches({ id: 'me' }).searches[5] as any
    expect(empty.retriever.standard.query.bool).toMatchObject({ must: { match_all: {} }, filter: [{ term: { kind: 'attendee' } }, { term: { discoverable: true } }] })
  })
  test('never touches the vault or a token', () => expect(JSON.stringify(bodies('x').searches)).not.toMatch(/vault|email|linkedin|github|photo|tokenHash/))
})

describe('prospectSearch', () => {
  test('opted-in attendees, minus scanned and muted, ranked against the booth topics', () => {
    const req = prospectSearch({ id: 'b1', interests: ['OpenTelemetry'], about: 'Traces in one place.' }, ['a5', 'a6']) as any
    expect(req.index).toBe('t_profiles')
    const [keyword, semantic] = req.retriever.rrf.retrievers
    expect(semantic.standard.query.bool.must).toEqual({ semantic: { field: 'about_semantic', query: 'OpenTelemetry Traces in one place.' } })
    for (const { standard } of [keyword, semantic]) {
      expect(standard.query.bool.filter).toEqual([{ term: { kind: 'attendee' } }, { term: { openToBooths: true } }])
      expect(standard.query.bool.must_not).toEqual([{ ids: { values: ['a5', 'a6'] } }])
    }
  })
})

describe('shaping', () => {
  test('a person is a silhouette: no interests, role, about or stuckOn, only the tags we both have', () => {
    const out = toDiscover(me, 'q', [[], [], [hit('p1', person)]])
    expect(out.people).toEqual([{ card: { id: 'p1', tagId: 7, kind: 'attendee', name: 'Viktor', pronouns: 'he/him', approach: 'ask', commPref: 'text me', common: [] }, fit: 100, common: [{ kind: 'same', mine: 'OpenTelemetry', theirs: 'opentelemetry' }] }])
    for (const key of secret) expect(out.people[0].card).not.toHaveProperty(key)
    expect(JSON.stringify(out.people)).not.toMatch(/Kafka|Backend|Trace context|sampling/)
    for (const key of secret) expect(toCard('p1', person)).not.toHaveProperty(key)
  })
  test('same tags ignore case and nothing else counts', () => {
    expect(sameTags(['eBPF', 'Go'], ['ebpf', 'Golang'])).toEqual([{ kind: 'same', mine: 'eBPF', theirs: 'ebpf' }])
    expect(sameTags(undefined, ['x'])).toEqual([])
  })
  test('booths are public and carry my star', () => {
    const [b1, b2] = toDiscover(me, 'tracing', [[], [hit('b1', booth), hit('b2', booth, { _score: 1 / 61 })], []]).booths
    expect(b1.card).toMatchObject({ name: 'Tracewise', interests: ['Distributed tracing'], about: 'Traces in one place.', pitch: 'Five minute demo', attachment: { label: 'Guide' }, starred: true })
    expect([b1.fit, b2.fit, b2.card.starred]).toEqual([100, 50, false])
  })
  test('talks come back whole, with a readable why', () => {
    const { id, ...source } = talks[0]
    const [t] = toDiscover(me, 'stuck on tracing', [[hit(id, source, { highlight: { abstract: [' keep one trace intact '] } })], [], []], true).talks
    expect(t).toEqual({ talk: talks[0], fit: 97, why: ['Matches Distributed tracing', '“keep one trace intact”'] })
    expect(why(['Accessibility', 'Community'], 'make my talks accessible', hit('t', {}))).toEqual(['Matches Accessibility', 'Matched on meaning, not keywords'])
    expect(why(['Kafka'], 'tracing', hit('t', {}))[0]).toBe('Covers Kafka')
  })
  test('fit: fused rank for hybrid hits, position for reranked ones, always 0 to 100', () => {
    expect([fit(hit('a', {}), 3), fit(hit('a', {}, { _score: 1 }), 0), fit(hit('a', {}, { _score: null }), 0)]).toEqual([100, 100, 0])
    expect([fit(hit('a', {}), 0, true), fit(hit('a', {}), 2, true), fit(hit('a', {}), 40, true)]).toEqual([97, 85, 0])
  })
  test('a prospect is anonymous to the booth unless they said booths may see their name', () => {
    expect(toProspect(hit('p1', person), 0)).toEqual({ card: { id: 'p1', tagId: 7, kind: 'attendee', name: null, pronouns: 'he/him', approach: 'ask', commPref: 'text me', common: [], role: 'Backend Engineer', interests: ['opentelemetry', 'Kafka'], about: 'Trace context everywhere.', stuckOn: 'sampling' }, fit: 100, source: 'match' })
    expect(toProspect(hit('p1', { ...person, boothsSeeName: true }), 0).card.name).toBe('Viktor')
  })
})

describe('talks', () => {
  test('about 30 fictional talks with fixed ids, valid times and 2 to 4 topics', () => {
    expect(talks.length).toBeGreaterThanOrEqual(28)
    expect(new Set(talks.map((t) => t.id)).size).toBe(talks.length)
    for (const t of talks) {
      expect(Date.parse(t.endsAt) - Date.parse(t.startsAt)).toBe(30 * 60_000)
      expect(t.topics.length).toBeGreaterThanOrEqual(2)
      expect(t.topics.length).toBeLessThanOrEqual(4)
      expect(t.abstract.length).toBeGreaterThan(80)
    }
  })
})

describe('routes', () => {
  let kind = 'attendee'
  const call = (app: { request: typeof discover.request }, path: string, method = 'GET') => app.request(path, { method, headers: { authorization: 'Bearer t' } })
  beforeEach(() => {
    vi.clearAllMocks()
    kind = 'attendee'
    es.get.mockImplementation(async ({ index, id }) => index === 'tokens' ? { _source: { profile: 'me', kind, tagId: 1 } } : { _source: ({ me, b1: booth, p1: person } as any)[id] })
    es.msearch.mockResolvedValue({ responses: [{ hits: { hits: [] } }, { hits: { hits: [hit('b1', booth)] } }, { hits: { hits: [hit('p1', person)] } }] })
  })

  test('GET /discover answers from one msearch and never returns a peer topic', async () => {
    const res = await call(discover, '/?q=tracing')
    const body = await res.json() as any
    expect(res.status).toBe(200)
    expect(es.msearch).toHaveBeenCalledTimes(1)
    expect(es.search).not.toHaveBeenCalled()
    expect(body).toMatchObject({ query: 'tracing', talks: [], booths: [{ card: { id: 'b1', starred: true } }] })
    for (const key of secret) expect(body.people[0].card).not.toHaveProperty(key)
    expect((await call(discover, '/')).status).toBe(200)
    kind = 'sponsor'
    expect(await (await call(discover, '/?q=tracing')).json()).toMatchObject({ people: [], booths: [{ card: { id: 'b1' } }] }) // booths never get named attendees here
    expect((await discover.request('/')).status).toBe(401)
  })
  test('a failed search costs its section, not the page', async () => {
    es.msearch.mockResolvedValue({ responses: [{ status: 500, error: {} }, { hits: { hits: [] } }, { hits: { hits: [hit('p1', person)] } }] })
    expect(await (await call(discover, '/?q=x')).json()).toMatchObject({ talks: [], people: [{ card: { id: 'p1' } }] })
  })
  test('prospects are for booths only, and skip people the booth scanned or who muted it', async () => {
    expect((await call(prospects, '/prospects')).status).toBe(403)
    kind = 'sponsor'
    es.msearch.mockResolvedValue({ responses: [{ hits: { hits: [{ _source: { scanned: 'a5' } }] } }, { hits: { hits: [{ _source: { attendee: 'a6' } }] } }] })
    es.search.mockResolvedValue({ hits: { hits: [hit('p1', person)] } })
    const body = await (await call(prospects, '/prospects')).json() as any
    expect(body.prospects).toMatchObject([{ source: 'match', card: { id: 'p1', name: null, stuckOn: 'sampling' } }])
    expect(JSON.stringify(es.search.mock.calls[0][0])).toContain('"must_not":[{"ids":{"values":["a5","a6"]}}]')
    es.msearch.mockResolvedValue({ responses: [{ hits: { hits: [] } }, { status: 503, error: {} }] })
    expect((await call(prospects, '/prospects')).status).toBe(500) // never guess who muted
  })
  test('star and unstar are one scripted update each, and only booths can be starred', async () => {
    expect(await (await call(booths, '/b1/star', 'PUT')).json()).toEqual({ starred: true })
    expect(await (await call(booths, '/b1/star', 'DELETE')).json()).toEqual({ starred: false })
    expect(es.update.mock.calls.map(([req]) => [req.index, req.id, req.script.params])).toEqual([['t_profiles', 'me', { id: 'b1', on: true }], ['t_profiles', 'me', { id: 'b1', on: false }]])
    expect((await call(booths, '/p1/star', 'PUT')).status).toBe(404)
    expect((await call(booths, '/nobody/star', 'DELETE')).status).toBe(404)
    expect(es.update).toHaveBeenCalledTimes(2)
  })
})
