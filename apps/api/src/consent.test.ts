import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cardFor, cardsFor, expiresAt, lowestFreeTag, sponsorAggQuery, tally, type Profile } from './consent.js'
import { es } from './es.js'

vi.mock('./es.js', () => ({ es: { get: vi.fn(), index: vi.fn(), mget: vi.fn() } }))

const person = (id: string, over: Partial<Profile> = {}): Profile => ({
  id, kind: 'attendee', tagId: 1, displayName: id, approach: 'open', commPref: "I'm Deaf, text me",
  role: 'dev', interests: ['rust'], lookingFor: ['job'], interestsVisibleTo: ['peers'], discoverable: true, ...over,
})
const ana = person('ana')
const ben = { id: 'ben', kind: 'attendee' } as const
const acme = { id: 'acme', kind: 'sponsor' } as const

describe('cardFor', () => {
  test('peer without mutual: badge and shared interests, contact sealed', () => {
    const card = cardFor({ subject: ana, viewer: ben })
    expect(card.badge).toEqual({ displayName: 'ana', pronouns: undefined, approach: 'open', commPref: "I'm Deaf, text me" })
    expect(card.interests?.interests).toEqual(['rust'])
    expect(card.unlocked).toEqual([])
  })

  test('peer with mutual catch: contact unlocked', () => {
    expect(cardFor({ subject: ana, viewer: ben, mutual: true }).unlocked).toEqual(['email', 'linkedin', 'github'])
  })

  test('peer when interests are not shared with peers: interests hidden', () => {
    const card = cardFor({ subject: person('ana', { interestsVisibleTo: ['sponsors'] }), viewer: ben, mutual: true })
    expect(card.interests).toBeUndefined()
    expect(card).not.toHaveProperty('interests')
  })

  test('sponsor never sees contact without a grant, even on a mutual catch', () => {
    expect(cardFor({ subject: ana, viewer: acme, mutual: true }).unlocked).toEqual([])
  })

  test('sponsor sees exactly the granted fields', () => {
    expect(cardFor({ subject: ana, viewer: acme, grantedFields: ['linkedin'] }).unlocked).toEqual(['linkedin'])
  })

  test('sponsor interests follow interestsVisibleTo', () => {
    expect(cardFor({ subject: ana, viewer: acme }).interests).toBeUndefined()
    expect(cardFor({ subject: person('ana', { interestsVisibleTo: ['sponsors'] }), viewer: acme }).interests?.lookingFor).toEqual(['job'])
  })

  test('self sees every envelope, even when sharing with nobody', () => {
    const card = cardFor({ subject: person('ana', { interestsVisibleTo: [] }), viewer: { id: 'ana', kind: 'attendee' } })
    expect(card.interests?.role).toBe('dev')
    expect(card.unlocked).toEqual(['email', 'linkedin', 'github'])
  })

  test('peer grants are ignored: only sponsors use granted fields', () => {
    expect(cardFor({ subject: ana, viewer: ben, grantedFields: ['email'] }).unlocked).toEqual([])
  })

  test('never leaks fields outside the envelopes (e.g. tokenHash)', () => {
    expect(JSON.stringify(cardFor({ subject: { ...ana, tokenHash: 'secret' } as Profile, viewer: ben }))).not.toContain('secret')
  })
})

describe('cardsFor (sealed envelope)', () => {
  const missing = { found: false }
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(es.get).mockResolvedValue({ _source: { email: 'a@x.io' } } as any)
    vi.mocked(es.index).mockResolvedValue({} as any)
  })

  test('no mutual catch: vault is never read and no receipt is written', async () => {
    vi.mocked(es.mget).mockResolvedValue({ docs: [missing] } as any)
    const [card] = await cardsFor(ben, [ana])
    expect(card.contact).toBeUndefined()
    expect(es.get).not.toHaveBeenCalled()
    expect(es.index).not.toHaveBeenCalled()
  })

  test('mutual catch: vault read and a receipt written', async () => {
    vi.mocked(es.mget).mockResolvedValueOnce({ docs: [{ found: true, _source: {} }] } as any).mockResolvedValueOnce({ docs: [missing] } as any)
    const [card] = await cardsFor(ben, [ana])
    expect(card.contact).toEqual({ email: 'a@x.io' })
    expect(vi.mocked(es.index).mock.calls[0][0]).toMatchObject({ index: 'receipts', document: { attendee: 'ana', viewer: 'ben' } })
  })

  test('sponsor: pending request stays sealed, granted request reads only granted fields', async () => {
    const req = (status: string) => ({ docs: [{ found: true, _source: { status, fields: ['email'] } }] })
    vi.mocked(es.mget).mockResolvedValueOnce({ docs: [missing] } as any).mockResolvedValueOnce(req('pending') as any)
    expect((await cardsFor(acme, [ana]))[0].contact).toBeUndefined()
    expect(es.get).not.toHaveBeenCalled()
    vi.mocked(es.mget).mockResolvedValueOnce({ docs: [missing] } as any).mockResolvedValueOnce(req('granted') as any)
    await cardsFor(acme, [ana])
    expect(vi.mocked(es.get).mock.calls[0][0]).toMatchObject({ index: 'vault', id: 'ana', _source_includes: ['email'] })
    expect(es.index).toHaveBeenCalledOnce()
  })
})

describe('helpers', () => {
  test('expiresAt is 7 days after the event ends', () => {
    expect(expiresAt('2026-11-09T18:30:00-07:00')).toBe('2026-11-17T01:30:00.000Z')
  })

  test('lowestFreeTag fills gaps and stops at the reserved range', () => {
    expect(lowestFreeTag([0, 1, 3])).toBe(2)
    expect(lowestFreeTag(Array.from({ length: 500 }, (_, i) => i))).toBeUndefined()
  })

  test('tally counts every status', () => {
    expect(tally(['pending', 'granted', 'pending'])).toEqual({ pending: 2, deferred: 0, granted: 1, denied: 0 })
  })

  test('sponsor aggregates only include attendees who share interests with sponsors', () => {
    expect(sponsorAggQuery(['ana']).query.bool.filter).toContainEqual({ term: { interestsVisibleTo: 'sponsors' } })
  })
})
