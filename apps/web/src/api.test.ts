import { expect, test } from 'vitest'
import { buildPath } from './api'
import { contactLink, httpsUrl, threadState } from './links'
import { createMock } from './mock/server'
import { silhouetteSvg } from './Silhouette'

test('buildPath fills params, encodes them and adds the query', () => {
  expect(buildPath('POST /api/people/:id/share', { id: 'p 1' })).toBe('/api/people/p%201/share')
  expect(buildPath('GET /api/discover', {}, { q: 'stuck on tracing', empty: undefined })).toBe('/api/discover?q=stuck+on+tracing')
  expect(() => buildPath('GET /api/people/:id')).toThrow(/Missing "id"/)
})

test('a scan lands in both lists with the same three things in common, one related', () => {
  const { call } = createMock()
  const [diego] = call('demo-500', 'POST /api/scan', { body: { tagIds: [501], source: 'manual' } }).cards
  expect(diego.common).toHaveLength(3)
  expect(diego.common).toContainEqual({ kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' })
  expect(diego.theyShared).toBeUndefined()
  const amara = call('demo-501', 'GET /api/people').people.find((p) => p.id === 'p500')!
  expect(amara.met?.by).toBe('them')
  expect(amara.common).toContainEqual({ kind: 'related', mine: 'Distributed tracing', theirs: 'OpenTelemetry' })
})

test('share shows the photo and chosen fields to the other person; unshare takes them back with a receipt', () => {
  const { call } = createMock()
  call('demo-500', 'POST /api/scan', { body: { tagIds: [501], source: 'manual' } })
  call('demo-501', 'POST /api/people/:id/share', { params: { id: 'p500' }, body: { fields: ['email'] } })
  const seen = () => call('demo-500', 'GET /api/people').people.find((p) => p.id === 'p501')!
  expect(seen().theyShared).toMatchObject({ fields: ['email'], contact: { email: 'diego@example.dev' } })
  expect(seen().theyShared?.photo).toMatch(/^data:image/)
  const { receipt } = call('demo-501', 'DELETE /api/people/:id/share', { params: { id: 'p500' } })
  expect(receipt).toMatchObject({ type: 'unshared', fields: ['email'] })
  expect(seen().theyShared).toBeUndefined()
})

test('a booth request is a first message with an attachment; no name leaks, and a yes becomes a lead with the note', () => {
  const { call } = createMock()
  const [visitor] = call('demo-580', 'POST /api/scan', { body: { tagIds: [500], source: 'manual' } }).cards
  expect(visitor.name).toBeNull()
  call('demo-580', 'POST /api/booth/requests', { body: { to: ['p500'], note: 'Hello', attachment: { url: 'https://example.dev/g.pdf', label: 'Guide' } } })
  const request = call('demo-500', 'GET /api/inbox').requests.find((r) => r.id === 'p580')!
  expect(request).toMatchObject({ status: 'request', startedBy: 'them', last: { text: 'Hello', from: 'them' }, attachment: { label: 'Guide' } })
  call('demo-500', 'POST /api/chats/:id/answer', { params: { id: 'p580' }, body: { action: 'share' } })
  expect(call('demo-580', 'GET /api/booth').leads.find((l) => l.card.id === 'p500')).toMatchObject({ via: 'request', note: 'Hello', card: { name: 'Amara' } })
})

test('Amara starts with two message requests, a person and a booth with an attachment, and has not met Diego', () => {
  const { call } = createMock()
  const { requests } = call('demo-500', 'GET /api/inbox')
  expect(requests.map((r) => r.with.kind).sort()).toEqual(['attendee', 'sponsor'])
  expect(requests.find((r) => r.with.kind === 'sponsor')?.attachment).toBeDefined()
  expect(call('demo-500', 'GET /api/people').people.some((p) => p.id === 'p501')).toBe(false)
})

test('the first message is a request, a reply opens the chat, and chatting shares nothing', () => {
  const { call } = createMock()
  call('demo-500', 'POST /api/scan', { body: { tagIds: [501], source: 'manual' } })
  const sent = call('demo-500', 'POST /api/chats/:id', { params: { id: 'p501' }, body: { text: 'Swap stories?' } })
  expect(sent.thread).toMatchObject({ id: 'p501', status: 'request', startedBy: 'me' })
  expect(() => call('demo-500', 'POST /api/chats/:id', { params: { id: 'p501' }, body: { text: 'Hello?' } })).toThrow(/waiting/)
  const [asked] = call('demo-501', 'GET /api/inbox').requests
  expect(asked).toMatchObject({ id: 'p500', startedBy: 'them', unread: 1, last: { text: 'Swap stories?' } })
  expect(asked.why).toContainEqual({ kind: 'related', mine: 'Distributed tracing', theirs: 'OpenTelemetry' })
  expect(threadState(asked.with)).toBe('Reply')
  expect(call('demo-501', 'POST /api/chats/:id', { params: { id: 'p500' }, body: { text: 'Yes' } }).thread.status).toBe('open')
  const chat = call('demo-500', 'GET /api/chats/:id', { params: { id: 'p501' } })
  expect(chat.messages.map((m) => m.from)).toEqual(['me', 'them'])
  expect(chat.thread.with.theyShared).toBeUndefined()
  expect(threadState(chat.thread.with)).toBe('Chat')
})

test('ignore and mute hide a request; a muted sender cannot write again', () => {
  const { call } = createMock()
  call('demo-500', 'POST /api/chats/:id/answer', { params: { id: 'p505' }, body: { action: 'mute' } })
  expect(call('demo-500', 'GET /api/inbox').requests.map((r) => r.id)).toEqual(['p581'])
  expect(() => call('demo-505', 'POST /api/chats/:id', { params: { id: 'p500' }, body: { text: 'Again' } })).toThrow()
})

test('auto-share to matching booths needs two things in common', () => {
  const { call } = createMock()
  for (const token of ['demo-508', 'demo-505']) call(token, 'PATCH /api/me', { body: { autoShare: 'matching' } })
  expect(call('demo-582', 'POST /api/booth/requests', { body: { to: ['p508'], note: 'Hi' } })).toEqual({ sent: 1, autoShared: 0 }) // Jun and Gitar: Developer experience only
  expect(call('demo-581', 'POST /api/booth/requests', { body: { to: ['p505'], note: 'Hi' } })).toEqual({ sent: 1, autoShared: 1 }) // Kwame and Dash0: OpenTelemetry and Kubernetes
})

test('the word on a card follows the conversation', () => {
  expect(threadState({})).toBe('Connect')
  expect(threadState({ thread: { status: 'request', startedBy: 'me', unread: 0 } })).toBe('Request sent')
  expect(threadState({ thread: { status: 'request', startedBy: 'them', unread: 1 } })).toBe('Reply')
  expect(threadState({ thread: { status: 'open', startedBy: 'me', unread: 0 } })).toBe('Chat')
})

test('contact values become safe links whether they are handles or whole URLs', () => {
  expect(contactLink('linkedin', 'amara-dev')).toEqual({ text: 'amara-dev', href: 'https://www.linkedin.com/in/amara-dev' })
  expect(contactLink('linkedin', 'https://www.linkedin.com/in/amara-dev/')).toEqual({ text: 'amara-dev', href: 'https://www.linkedin.com/in/amara-dev' })
  expect(contactLink('linkedin', 'linkedin.com/in/amara-dev')).toEqual({ text: 'amara-dev', href: 'https://www.linkedin.com/in/amara-dev' })
  expect(contactLink('github', '@amara500').href).toBe('https://github.com/amara500')
  expect(contactLink('github', 'javascript:alert(1)').href).toBeUndefined()
  expect(contactLink('linkedin', 'https://evil.example/in/amara').href).toBeUndefined()
  expect(contactLink('email', 'amara@example.dev').href).toBe('mailto:amara@example.dev')
  expect(contactLink('email', 'javascript:alert(1)').href).toBeUndefined()
  expect(httpsUrl('http://example.dev/a.pdf')).toBeUndefined()
  expect(httpsUrl('https://example.dev/a.pdf')).toBe('https://example.dev/a.pdf')
})

test('silhouettes are the same every time and differ between people', () => {
  expect(silhouetteSvg('p500')).toBe(silhouetteSvg('p500'))
  expect(new Set(['p500', 'p501', 'p502', 'p503'].map(silhouetteSvg)).size).toBe(4)
})
