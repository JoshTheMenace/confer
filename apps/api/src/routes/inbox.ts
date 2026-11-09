import { Hono } from 'hono'
import { auth, type Me } from '../auth.js'
import { cardFor, relations, toReceipt, toThread, visible, type ReceiptDoc, type ThreadDoc } from '../consent.js'
import type { Api } from '../contract.js'
import { es, ix } from '../es.js'

/** Pure: message requests waiting for my answer (never from someone I muted), and my open chats plus the requests I sent, newest first. */
export function split(viewer: string, threads: { doc: ThreadDoc; muted?: boolean; thread: Api['GET /api/inbox']['res']['chats'][number] }[]) {
  const newest = threads.sort((x, y) => y.thread.last.at.localeCompare(x.thread.last.at))
  return {
    requests: newest.filter((t) => t.doc.status === 'request' && t.doc.startedBy !== viewer && !t.muted).map((t) => t.thread),
    chats: newest.filter((t) => t.doc.status === 'open' || t.doc.startedBy === viewer).map((t) => t.thread),
  }
}

export const inbox = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .get('/', async (c) => {
    const viewer = c.var.me
    const [found, log] = await Promise.all([
      es.search<ThreadDoc>({ index: ix.threads, size: 200, _source: ['a', 'b'], query: { bool: { should: [{ term: { a: viewer.id } }, { term: { b: viewer.id } }] } }, sort: [{ lastAt: 'desc' }] }),
      es.search<Omit<ReceiptDoc, 'id'>>({ index: ix.receipts, size: 200, query: { term: { owner: viewer.id } }, sort: [{ at: 'desc' }] }),
    ])
    const receipts = log.hits.hits.map((h) => ({ ...h._source!, id: h._id! }))
    const others = found.hits.hits.map(({ _source: t }) => (t!.a === viewer.id ? t!.b : t!.a))
    // Search only says who I talk to; each thread is then read by id, so a new message or an answer shows on the next poll.
    const { me, rels } = await relations(viewer, [...new Set([...others, ...receipts.map((r) => r.who)])])
    // Silhouettes only: listing my inbox never opens anyone's vault.
    const cards = new Map(rels.map((r) => [r.subject.id, cardFor({ ...viewer, starred: me.starred }, r)]))
    const threads = rels.flatMap((r) => (r.thread && visible(r.thread, viewer.id).length ? [{ doc: r.thread, muted: r.muted, thread: toThread(r.thread, viewer.id, cards.get(r.subject.id)!) }] : []))
    return c.json({ ...split(viewer.id, threads), receipts: receipts.map((r) => toReceipt(r, cards)) } satisfies Api['GET /api/inbox']['res'])
  })
