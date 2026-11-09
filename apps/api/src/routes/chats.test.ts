import { beforeEach, describe, expect, test, vi } from 'vitest'
import { cannotStart, cardFor, pairId, threadId, toMessages, toThread, type Meeting, type ThreadDoc } from '../consent.js'
import type { Profile } from '../contract.js'
import { es } from '../es.js'
import { chats } from './chats.js'
import { split } from './inbox.js'

vi.mock('../es.js', () => ({
  es: { get: vi.fn(), mget: vi.fn(), bulk: vi.fn(), create: vi.fn(), update: vi.fn(), index: vi.fn() },
  ix: new Proxy({}, { get: (_, name) => name }), refreshSoon: vi.fn(),
}))
vi.mock('../common.js', () => ({ commonOf: async () => [{ kind: 'same', mine: 'Go', theirs: 'Go' }] }))

const person = (id: string, over: Partial<Profile> = {}): Profile => ({
  id, tagId: 1, kind: 'attendee', displayName: id, approach: 'open', role: 'SRE', interests: ['Go', 'eBPF'], lookingFor: [], about: 'about me', stuckOn: 'stuck',
  discoverable: false, openToBooths: false, boothsSeeName: false, autoShare: 'off', shareFields: ['email'], starred: [], hasPhoto: false, ...over,
})
const ana = person('ana'), ben = person('ben'), acme = person('acme', { kind: 'sponsor', attachment: { url: 'https://example.com/guide', label: 'Guide' } })
const met: Meeting = { scanner: 'x', scanned: 'y', kind: 'peer', source: 'camera', at: '2026-11-09T09:00:00.000Z', common: [{ kind: 'related', mine: 'eBPF', theirs: 'Cilium' }] }
const doc = (over: Partial<ThreadDoc> = {}): ThreadDoc => ({
  a: 'ana', b: 'ben', startedBy: 'ben', kind: 'peer', status: 'request', source: 'scan', why: met.common, firstText: 'Hi Ana', createdAt: '2026-11-09T10:00:00.000Z',
  lastAt: '2026-11-09T10:00:00.000Z', expiresAt: '2026-11-16T10:00:00.000Z', readB: '2026-11-09T10:00:00.000Z',
  messages: [{ id: 'm1', from: 'ben', text: 'Hi Ana', at: '2026-11-09T10:00:00.000Z' }], ...over,
})

describe('toThread: one doc, two sides', () => {
  const benCard = cardFor({ id: 'ana', kind: 'attendee' }, { subject: ben }), anaCard = cardFor({ id: 'ben', kind: 'attendee' }, { subject: ana })
  test('the recipient sees it from them, unread, with why turned around', () => {
    expect(toThread(doc(), 'ana', benCard)).toMatchObject({
      id: 'ben', status: 'request', startedBy: 'them', unread: 1, why: [{ kind: 'related', mine: 'Cilium', theirs: 'eBPF' }],
      last: { text: 'Hi Ana', from: 'them' }, expiresAt: '2026-11-16T10:00:00.000Z',
    })
  })
  test('the sender sees it from me, read, with why as stored', () => {
    expect(toThread(doc(), 'ben', anaCard)).toMatchObject({ id: 'ana', startedBy: 'me', unread: 0, why: met.common, last: { from: 'me' } })
    expect(toMessages(doc(), 'ben')).toEqual([{ id: 'm1', from: 'me', text: 'Hi Ana', at: '2026-11-09T10:00:00.000Z' }])
  })
  test('an open chat does not expire, and unread counts only their messages after my marker', () => {
    const open = doc({ status: 'open', readA: '2026-11-09T10:01:00.000Z', messages: [...doc().messages, { id: 'm2', from: 'ana', text: 'Hi', at: '2026-11-09T10:01:00.000Z' }, { id: 'm3', from: 'ben', text: 'Coffee?', at: '2026-11-09T10:02:00.000Z' }] })
    expect(toThread(open, 'ana', benCard)).toMatchObject({ unread: 1, last: { text: 'Coffee?', from: 'them' } })
    expect(toThread(open, 'ana', benCard)).not.toHaveProperty('expiresAt')
  })
  test('a chat never widens the lens: a booth still gets no name, a peer still gets no topics', () => {
    const open = doc({ status: 'open' })
    expect(cardFor({ id: 'acme', kind: 'sponsor' }, { subject: ana, thread: { ...open, b: 'acme', startedBy: 'acme' } }).name).toBeNull()
    const card = cardFor({ id: 'ben', kind: 'attendee' }, { subject: ana, thread: open })
    expect(card.thread).toEqual({ status: 'open', startedBy: 'me', unread: 0 })
    for (const key of ['interests', 'role', 'about', 'stuckOn', 'theyShared']) expect(card).not.toHaveProperty(key)
  })
})

describe('cannotStart: who may send a first message', () => {
  test('attendee to attendee: only if they met (either way) or the recipient is discoverable', () => {
    expect(cannotStart(ben, ana)).toMatch(/met/)
    expect(cannotStart(ben, ana, met)).toBeUndefined()
    expect(cannotStart(ben, ana, undefined, met)).toBeUndefined()
    expect(cannotStart(ben, person('ana', { discoverable: true }))).toBeUndefined()
  })
  test('anyone may write to a booth', () => {
    expect(cannotStart(ben, acme)).toBeUndefined()
  })
  test('booth to attendee: only if it scanned them or they are open to booths', () => {
    expect(cannotStart(acme, ana)).toMatch(/scanned/)
    expect(cannotStart(acme, ana, undefined, met)).toMatch(/scanned/) // the attendee scanning the booth is not an invitation
    expect(cannotStart(acme, person('ana', { discoverable: true }))).toMatch(/scanned/)
    expect(cannotStart(acme, ana, met)).toBeUndefined()
    expect(cannotStart(acme, person('ana', { openToBooths: true }))).toBeUndefined()
  })
})

test('inbox split: requests wait for my answer and never come from someone I muted; chats are open threads and requests I sent', () => {
  const row = (other: string, over: Partial<ThreadDoc>, at: string, muted = false) => {
    const d = doc({ b: other, startedBy: other, lastAt: at, messages: [{ id: other, from: other, text: 'hi', at }], ...over })
    return { doc: d, muted, thread: toThread(d, 'ana', cardFor({ id: 'ana', kind: 'attendee' }, { subject: person(other) })) }
  }
  const { requests, chats } = split('ana', [
    row('ben', {}, '2026-11-09T10:00:00.000Z'), row('cat', {}, '2026-11-09T10:05:00.000Z'), row('mutee', {}, '2026-11-09T10:06:00.000Z', true),
    row('dan', { status: 'open' }, '2026-11-09T10:01:00.000Z'), row('eve', { startedBy: 'ana' }, '2026-11-09T10:03:00.000Z'), row('fay', { status: 'ignored' }, '2026-11-09T10:04:00.000Z'),
  ])
  expect(requests.map((t) => t.id)).toEqual(['cat', 'ben'])
  expect(chats.map((t) => t.id)).toEqual(['eve', 'dan'])
})

describe('routes', () => {
  // mget answers in the order `relations` asks: me, then them, my scan, their scan, their share, my share, my mute, their mute, the thread.
  const as = (me: Profile, them: Profile, rel: { mine?: Meeting; theirs?: Meeting; mutedMe?: boolean; thread?: ThreadDoc } = {}) => {
    vi.mocked(es.get).mockResolvedValue({ _source: { profile: me.id, kind: me.kind, tagId: 1 } } as any)
    const found = [me, them, rel.mine, rel.theirs, undefined, undefined, undefined, rel.mutedMe ? {} : undefined, rel.thread]
    vi.mocked(es.mget).mockResolvedValue({ docs: found.map((_source) => ({ found: !!_source, _source })) } as any)
  }
  const call = (path: string, body?: object) =>
    chats.request(path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(es.bulk).mockResolvedValue({ items: [] } as any)
  })

  test('a first message becomes a request; a stranger who is not discoverable gets a plain 403', async () => {
    as(ben, ana)
    expect((await call('/ana', { text: 'Hi' })).status).toBe(403)
    expect(es.create).not.toHaveBeenCalled()
    as(ben, ana, { theirs: met })
    const body = await (await call('/ana', { text: ' Hi Ana ' })).json()
    expect(body.thread).toMatchObject({ id: 'ana', status: 'request', startedBy: 'me', source: 'scan', why: [{ mine: 'Cilium', theirs: 'eBPF' }], last: { text: 'Hi Ana', from: 'me' } })
    expect(vi.mocked(es.create).mock.calls[0][0]).toMatchObject({ index: 'threads', id: threadId('ben', 'ana'), document: { a: 'ana', b: 'ben', startedBy: 'ben', firstText: 'Hi Ana' } })
  })

  test('a mute never leaks: the sender gets 200 and a normal thread, the recipient sees nothing', async () => {
    as(ben, ana, { mine: met, mutedMe: true })
    const res = await call('/ana', { text: 'Hello?' })
    expect(res.status).toBe(200)
    expect((await res.json()).thread).toMatchObject({ status: 'request', startedBy: 'me', last: { text: 'Hello?' } })
    const stored = (vi.mocked(es.create).mock.calls[0][0] as any).document as ThreadDoc
    expect(toMessages(stored, 'ana')).toEqual([])
    expect(cardFor({ id: 'ana', kind: 'attendee' }, { subject: ben, thread: stored })).not.toHaveProperty('thread')
    as(ana, ben, { thread: stored })
    expect((await call('/ben')).status).toBe(404)
    expect((await call('/ben/answer', { action: 'accept' })).status).toBe(404)
  })

  test('only a booth\'s first message may carry an attachment, and only over https', async () => {
    const attachment = { url: 'https://example.com/a', label: 'A' }
    as(ben, acme)
    expect((await call('/acme', { text: 'Hi', attachment })).status).toBe(400)
    as(acme, ana, { mine: met })
    expect((await call('/ana', { text: 'Hi', attachment: { ...attachment, url: 'http://example.com/a' } })).status).toBe(400)
    expect((await (await call('/ana', { text: 'Hi', attachment })).json()).thread.attachment).toEqual(attachment)
    as(acme, ana, { mine: met, thread: doc({ b: 'acme', startedBy: 'acme' }) })
    expect((await call('/ana', { text: 'Again', attachment })).status).toBe(400)
  })

  test('a reply from the recipient opens the chat, with one scripted append', async () => {
    as(ana, ben, { thread: doc() })
    expect((await (await call('/ben', { text: 'Hi Ben' })).json()).thread).toMatchObject({ status: 'open', startedBy: 'them', last: { text: 'Hi Ben', from: 'me' } })
    expect(es.update).toHaveBeenCalledTimes(1)
    expect(vi.mocked(es.update).mock.calls[0][0]).toMatchObject({ id: 'ana_ben', script: { params: { open: true, read: 'readA', m: { from: 'ana', text: 'Hi Ben' } } } })
  })

  test('only the recipient of a request may answer it', async () => {
    as(ben, ana, { thread: doc() })
    expect((await call('/ana/answer', { action: 'accept' })).status).toBe(403)
    for (const status of ['open', 'ignored'] as const) {
      as(ana, ben, { thread: doc({ status }) })
      expect((await call('/ben/answer', { action: 'ignore' })).status).toBe(403)
    }
    as(ana, ben)
    expect((await call('/ben/answer', { action: 'accept' })).status).toBe(404)
  })

  test('share accepts and hands over the card with a receipt; mute writes the mute and hides the thread', async () => {
    as(ana, ben, { thread: doc() })
    const shared = (await (await call('/ben/answer', { action: 'share' })).json()).thread
    expect(shared).toMatchObject({ status: 'open', with: { iShared: { fields: ['email'] } } })
    expect((vi.mocked(es.bulk).mock.calls[0][0] as any).operations).toMatchObject([
      { index: { _index: 'shares', _id: pairId('ana', 'ben') } }, { from: 'ana', to: 'ben', via: 'request' }, { index: { _index: 'receipts' } }, { owner: 'ana', who: 'ben', type: 'shared' },
    ])
    as(ana, ben, { thread: doc() })
    expect((await (await call('/ben/answer', { action: 'mute' })).json()).thread.status).toBe('ignored')
    expect(vi.mocked(es.index).mock.calls[0][0]).toMatchObject({ index: 'mutes', id: 'ana_ben' })
  })
})
