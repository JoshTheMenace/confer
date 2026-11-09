import { beforeEach, describe, expect, test, vi } from 'vitest'
import { allShares, autoShares, cardFor, fitOf, openVault, type Meeting, type Share } from './consent.js'
import type { Common, ContactField, Profile } from './contract.js'
import { es } from './es.js'

vi.mock('./es.js', () => ({ es: { search: vi.fn(), mget: vi.fn(), bulk: vi.fn() }, ix: new Proxy({}, { get: (_, name) => name }) }))

const person = (id: string, over: Partial<Profile> = {}): Profile => ({
  id, tagId: 1, kind: 'attendee', displayName: id, pronouns: 'she/her', approach: 'open', commPref: "I'm Deaf, text me",
  role: 'SRE', interests: ['Go', 'eBPF', 'Rust'], lookingFor: ['mentoring'], about: 'about me', stuckOn: 'stuck on tracing',
  discoverable: true, openToBooths: false, boothsSeeName: false, autoShare: 'off', shareFields: ['email'], starred: [], hasPhoto: true, ...over,
})
const ana = person('ana'), open = person('ana', { openToBooths: true })
const acmeBooth = person('acme', { kind: 'sponsor', interests: ['Search'], about: 'we do search', pitch: 'Here is the guide', attachment: { url: 'https://example.com/guide', label: 'Guide' } })
const ben = { id: 'ben', kind: 'attendee' } as const, acme = { id: 'acme', kind: 'sponsor' } as const
const common: Common[] = [{ kind: 'same', mine: 'Go', theirs: 'go' }, { kind: 'related', mine: 'eBPF', theirs: 'Cilium' }]
const meeting = (scanner: string, scanned: string, at = '2026-11-09T10:00:00.000Z'): Meeting => ({ scanner, scanned, kind: 'peer', source: 'camera', at, common })
const share = (from: string, to: string, fields: ContactField[] = ['email']): Share => ({ from, to, fields, via: 'manual', at: '2026-11-09T11:00:00.000Z' })
const vault = { email: 'ana@example.com', linkedin: 'in/ana', github: 'ana', photo: 'data:image/png;base64,AAAA' }
const topics = ['interests', 'role', 'about', 'stuckOn'] as const

test('allShares follows search_after beyond the first page', async () => {
  const first = Array.from({ length: 1000 }, (_, i) => ({
    sort: [`attendee-${i}`, 'booth'], _source: { from: `attendee-${i}`, to: 'booth', fields: ['email'], via: 'manual', at: '2026-11-09T11:00:00.000Z' },
  }))
  vi.mocked(es.search).mockResolvedValueOnce({ hits: { hits: first } } as any)
    .mockResolvedValueOnce({ hits: { hits: [{ sort: ['attendee-1000', 'booth'], _source: { from: 'attendee-1000', to: 'booth', fields: ['email'], via: 'manual', at: '2026-11-09T11:00:00.000Z' } }] } } as any)

  const found = await allShares({ term: { to: 'booth' } })

  expect(found).toHaveLength(1001)
  expect(es.search).toHaveBeenCalledTimes(2)
  expect(vi.mocked(es.search).mock.calls[1][0]).toMatchObject({ search_after: ['attendee-999', 'booth'], sort: [{ from: 'asc' }, { to: 'asc' }] })
})

describe('cardFor: peers', () => {
  test('a peer gets the badge and nothing else', () => {
    expect(cardFor(ben, { subject: ana })).toEqual({ id: 'ana', tagId: 1, kind: 'attendee', name: 'ana', pronouns: 'she/her', approach: 'open', commPref: "I'm Deaf, text me", common: [] })
  })

  test('a peer never gets topics: not when open to booths, not after a share', () => {
    for (const card of [cardFor(ben, { subject: open }), cardFor(ben, { subject: open, mine: meeting('ben', 'ana'), shareIn: share('ana', 'ben'), vault })])
      for (const key of topics) expect(card).not.toHaveProperty(key)
  })

  test('common comes from the frozen meeting: mine as stored, theirs swapped', () => {
    expect(cardFor(ben, { subject: ana, mine: meeting('ben', 'ana') }).common).toEqual(common)
    expect(cardFor(ben, { subject: ana, theirs: meeting('ana', 'ben') }).common).toEqual([{ kind: 'same', mine: 'go', theirs: 'Go' }, { kind: 'related', mine: 'Cilium', theirs: 'eBPF' }])
  })

  test('met says who scanned whom, with the latest time', () => {
    expect(cardFor(ben, { subject: ana }).met).toBeUndefined()
    expect(cardFor(ben, { subject: ana, mine: meeting('ben', 'ana') }).met?.by).toBe('me')
    expect(cardFor(ben, { subject: ana, theirs: meeting('ana', 'ben') }).met?.by).toBe('them')
    expect(cardFor(ben, { subject: ana, mine: meeting('ben', 'ana'), theirs: meeting('ana', 'ben', '2026-11-09T12:00:00.000Z') }).met).toEqual({ at: '2026-11-09T12:00:00.000Z', by: 'both' })
  })

  test('internal fields never leave (tokenHash, interestEdits, lookingFor)', () => {
    const card = cardFor(ben, { subject: { ...ana, tokenHash: 'secret-hash', interestEdits: 3 } as Profile })
    expect(JSON.stringify(card)).not.toMatch(/secret-hash|interestEdits|mentoring/)
  })
})

describe('cardFor: sharing', () => {
  test('no share: no contact, photo or role, even if a vault is passed in', () => {
    const card = cardFor(ben, { subject: ana, mine: meeting('ben', 'ana'), theirs: meeting('ana', 'ben'), vault })
    expect(card.theyShared).toBeUndefined()
    expect(JSON.stringify(card)).not.toMatch(/example\.com|data:image|SRE/)
  })

  test('a share hands over exactly the shared fields, plus photo and role', () => {
    expect(cardFor(ben, { subject: ana, shareIn: share('ana', 'ben', ['email', 'github']), vault }).theyShared)
      .toEqual({ at: '2026-11-09T11:00:00.000Z', fields: ['email', 'github'], contact: { email: 'ana@example.com', github: 'ana' }, photo: vault.photo, role: 'SRE' })
  })

  test('my share to them shows as iShared and reveals nothing of theirs', () => {
    const card = cardFor(ben, { subject: ana, shareOut: share('ben', 'ana') })
    expect(card.iShared).toEqual({ at: '2026-11-09T11:00:00.000Z', fields: ['email'] })
    expect(card.theyShared).toBeUndefined()
  })
})

describe('cardFor: booths', () => {
  test('a booth sees an attendee\'s topics only if they are open to booths', () => {
    const closed = cardFor(acme, { subject: ana })
    for (const key of topics) expect(closed).not.toHaveProperty(key)
    expect(cardFor(acme, { subject: open })).toMatchObject({ interests: ['Go', 'eBPF', 'Rust'], role: 'SRE', about: 'about me', stuckOn: 'stuck on tracing' })
  })

  test('a booth gets no name unless boothsSeeName or the person shared', () => {
    expect(cardFor(acme, { subject: open }).name).toBeNull()
    expect(cardFor(acme, { subject: open, mine: meeting('acme', 'ana'), shareOut: share('acme', 'ana') }).name).toBeNull()
    expect(cardFor(acme, { subject: person('ana', { boothsSeeName: true }) }).name).toBe('ana')
    expect(cardFor(acme, { subject: ana, shareIn: share('ana', 'acme'), vault }).name).toBe('ana')
  })

  test('a booth\'s own profile is public, with the viewer\'s star and mute', () => {
    expect(cardFor({ ...ben, starred: ['acme'] }, { subject: acmeBooth, muted: true }))
      .toMatchObject({ name: 'acme', interests: ['Search'], about: 'we do search', pitch: 'Here is the guide', attachment: { label: 'Guide' }, starred: true, muted: true })
    expect(cardFor(ben, { subject: acmeBooth })).toMatchObject({ starred: false, muted: false })
    expect(cardFor(ben, { subject: acmeBooth })).not.toHaveProperty('stuckOn')
  })
})

describe('openVault: the only vault read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(es.mget).mockResolvedValue({ docs: [{ found: true, _source: vault }] } as any)
    vi.mocked(es.bulk).mockResolvedValue({ errors: false, items: [] } as any)
  })

  test('a read backed by the owner\'s share returns the vault and leaves an opened receipt', async () => {
    expect((await openVault('ben', [{ owner: 'ana', share: share('ana', 'ben') }])).get('ana')).toEqual(vault)
    expect(vi.mocked(es.mget).mock.calls[0][0]).toMatchObject({ docs: [{ _index: 'vault', _id: 'ana' }] })
    const [action, receipt] = (vi.mocked(es.bulk).mock.calls[0][0] as any).operations
    expect(action).toEqual({ index: { _index: 'receipts', _id: 'ana_ben_opened' } })
    expect(receipt).toMatchObject({ owner: 'ana', who: 'ben', type: 'opened', fields: ['email'] })
  })

  test('no share, or a share between other people, reads nothing and writes nothing', async () => {
    for (const s of [undefined, share('ana', 'cat'), share('cat', 'ben'), share('ben', 'ana')])
      expect((await openVault('ben', [{ owner: 'ana', share: s }])).size).toBe(0)
    expect(es.mget).not.toHaveBeenCalled()
    expect(es.bulk).not.toHaveBeenCalled()
  })

  test('reading it again re-stamps the same receipt, at most once a minute', async () => {
    vi.useFakeTimers({ now: Date.now() + 3_600_000 })
    const read = () => openVault('cat', [{ owner: 'ana', share: share('ana', 'cat') }])
    await read()
    await read()
    expect(es.bulk).toHaveBeenCalledTimes(1)
    expect(es.mget).toHaveBeenCalledTimes(2) // the share is still checked and the vault still read every time
    vi.advanceTimersByTime(61_000)
    await read()
    expect(vi.mocked(es.bulk).mock.calls.map(([r]) => (r as any).operations[0].index._id)).toEqual(['ana_cat_opened', 'ana_cat_opened'])
    vi.useRealTimers()
  })

  test('a re-share after an unshare gets its own opened receipt within a minute', async () => {
    await openVault('eve', [{ owner: 'ana', share: share('ana', 'eve') }])
    await openVault('eve', [{ owner: 'ana', share: { ...share('ana', 'eve', ['email', 'github']), at: '2026-11-09T11:05:00.000Z' } }])
    expect(es.bulk).toHaveBeenCalledTimes(2)
    const [, second] = vi.mocked(es.bulk).mock.calls.map(([r]) => (r as any).operations[1])
    expect(second).toMatchObject({ type: 'opened', fields: ['email', 'github'] })
  })

  test('reading your own vault needs no share and writes no receipt', async () => {
    expect((await openVault('ana', [{ owner: 'ana' }])).get('ana')).toEqual(vault)
    expect(es.bulk).not.toHaveBeenCalled()
  })
})

describe('auto-share and fit', () => {
  test('auto-share only under a rule the attendee turned on', () => {
    expect(autoShares(person('ana', { starred: ['acme'] }), 'acme', common)).toBe(false) // off
    expect(autoShares(person('ana', { autoShare: 'starred', starred: ['acme'] }), 'acme', [])).toBe(true)
    expect(autoShares(person('ana', { autoShare: 'starred', starred: ['other'] }), 'acme', common)).toBe(false)
    expect(autoShares(person('ana', { autoShare: 'matching' }), 'acme', common)).toBe(true)
    expect(autoShares(person('ana', { autoShare: 'matching' }), 'acme', common.slice(0, 1))).toBe(false)
    expect(autoShares(person('x', { kind: 'sponsor', autoShare: 'matching' }), 'acme', common)).toBe(false)
  })

  test('fit grows with things in common and a star, and stays within 0 to 100', () => {
    expect(fitOf([], false)).toBe(0)
    expect(fitOf(common, false)).toBe(40)
    expect(fitOf(common, true)).toBe(60)
    expect(fitOf(Array(5).fill(common[0]), true)).toBe(100)
  })
})
