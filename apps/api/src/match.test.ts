import { beforeEach, describe, expect, test, vi } from 'vitest'
import { typeOf } from './dexTypes.js'
import { buildMatchQuery, peerCard, sharedInterests, templateWhy, type Profile } from './match.js'

const es = vi.hoisted(() => ({ search: vi.fn(), get: vi.fn() }))
vi.mock('./es.js', () => ({ es }))
const { matches } = await import('./routes/matches.js')

const ana: Profile = {
  tagId: 500, kind: 'attendee', discoverable: true, interestsVisibleTo: ['peers'],
  displayName: 'Ana', pronouns: 'she/her', approach: 'open', commPref: 'text me',
  role: 'SRE', interests: ['OpenTelemetry', 'eBPF'], lookingFor: ['mentoring'], about: 'Traces all day.',
}
const ben: Profile = { ...ana, tagId: 501, displayName: 'Ben', interests: ['ebpf', 'Kafka'], interestsVisibleTo: ['sponsors'] }

describe('typeOf', () => {
  test('picks the bucket most interests fall in', () => {
    expect(typeOf(['OpenTelemetry', 'eBPF', 'Kubernetes'])).toBe('Observability')
    expect(typeOf(['LLM', 'RAG'])).toBe('AI')
    expect(typeOf(['Supply chain security', 'SBOM'])).toBe('Security')
    expect(typeOf(['Community', 'Docs'])).toBe('Community')
  })
  test('matches whole-word starts only, and falls back to Explorer', () => {
    expect(typeOf(['Maintaining sourdough'])).toBe('Explorer')
    expect(typeOf([])).toBe('Explorer')
  })
})

describe('buildMatchQuery', () => {
  test('hybrid rrf of lexical + semantic, each scoped by the consent filters', () => {
    const req = buildMatchQuery({ id: 'me', interests: ['eBPF'], about: 'kernel nerd' })
    const children = req.retriever.rrf!.retrievers as any[]
    expect(req.index).toBe('profiles')
    expect(req._source.excludes).toContain('tokenHash')
    expect(children).toHaveLength(2)
    expect(JSON.stringify(children[1])).toContain('"semantic":{"field":"about_semantic","query":"eBPF kernel nerd"}')
    for (const { standard } of children) {
      expect(standard.query.bool.filter).toEqual([{ term: { kind: 'attendee' } }, { term: { discoverable: true } }, { term: { interestsVisibleTo: 'peers' } }])
      expect(standard.query.bool.must_not).toEqual([{ ids: { values: ['me'] } }])
    }
  })
  test('free text q drives both retrievers', () => {
    expect(JSON.stringify(buildMatchQuery({ id: 'me', interests: ['eBPF'] }, 'gitops'))).toContain('"query":"gitops"')
  })
  test('empty profile and no q still returns scoped results', () => {
    expect(buildMatchQuery({ id: 'me' }).retriever).toHaveProperty('standard.query.bool.must.match_all')
  })
  test('never references the vault or contact fields', () => {
    expect(JSON.stringify(buildMatchQuery({ id: 'me', interests: ['x'] }, 'y'))).not.toMatch(/vault|email|linkedin|github/)
  })
})

describe('consent', () => {
  test('peers see yellow only when it is shared with peers', () => {
    expect(peerCard(ana)).toMatchObject({ displayName: 'Ana', role: 'SRE', interests: ['OpenTelemetry', 'eBPF'] })
    expect(peerCard(ben)).toEqual({ displayName: 'Ben', pronouns: 'she/her', approach: 'open', commPref: 'text me' })
  })
  test('shared interests ignore case', () => expect(sharedInterests(ana.interests, ben.interests)).toEqual(['eBPF']))
  test('template sentence uses shared interests', () => {
    expect(templateWhy(peerCard(ana), ['eBPF'])).toContain('both care about eBPF')
    expect(templateWhy(peerCard(ben), [])).toContain('Ben')
  })
})

describe('routes', () => {
  const call = (path: string) => matches.request(path, { headers: { authorization: 'Bearer t' } })
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.OPENAI_API_KEY
    es.get.mockImplementation(async ({ id }) => ({ me: { _source: ana }, b: { _source: { ...ben, interestsVisibleTo: ['peers'] } } } as any)[id] ?? Promise.reject(new Error('404')))
    es.search.mockImplementation(async ({ query }) => query?.term?.tokenHash
      ? { hits: { hits: [{ _id: 'me', _source: ana }] } }
      : { hits: { hits: [{ _id: 'b', _score: 0.5, _source: { ...ben, interestsVisibleTo: ['peers'] } }] } })
  })
  test('GET / returns cards with type and shared interests, and only searches profiles', async () => {
    const [m] = await (await call('/')).json()
    expect(m).toMatchObject({ id: 'b', tagId: 501, type: 'Observability', sharedInterests: ['eBPF'], score: 0.5 })
    expect(es.search.mock.calls.every(([req]) => req.index === 'profiles')).toBe(true)
  })
  test('GET /:id/why falls back to a template without an OpenAI key', async () => {
    expect(await (await call('/b/why')).json()).toEqual({ why: expect.stringContaining('both care about eBPF') })
    expect((await call('/nobody/why')).status).toBe(404)
  })
})
