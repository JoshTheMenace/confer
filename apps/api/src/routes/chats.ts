import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { cannotStart, cards, giveCards, pairId, readKey, relations, send, threadId, toMessages, toThread, visible } from '../consent.js'
import { contactFields, type Api } from '../contract.js'
import { es, ix, refreshSoon } from '../es.js'
import { log, requests, span } from '../telemetry.js'
import { attachment } from './me.js'
import { tooFast } from './scan.js'

const outcome = { accept: 'accepted', share: 'shared', ignore: 'ignored', mute: 'muted' } as const
const none = { error: 'No conversation with this person yet' }

export const chats = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .get('/:id', async (c) => {
    const viewer = c.var.me
    // One real-time read by id: the thread, its messages and everything the lens needs. No search, so no refresh lag.
    const { me, rels: [rel] } = await relations(viewer, [c.req.param('id')])
    const t = rel?.thread
    if (!t || !visible(t, viewer.id).length) return c.json(none, 404)
    const [card] = await cards({ ...viewer, starred: me.starred }, [rel])
    const thread = toThread(t, viewer.id, card)
    // Polled every 2 seconds: the read marker is written only when there is something new, and the reader does not wait for it.
    if (thread.unread) {
      void es.update({ index: ix.threads, id: threadId(viewer.id, rel.subject.id), retry_on_conflict: 3, doc: { [readKey(t, viewer.id)]: new Date().toISOString() } })
        .catch((err) => log.warn({ err: err?.name }, 'read marker not saved'))
    }
    return c.json({ thread: { ...thread, unread: 0 }, messages: toMessages(t, viewer.id) } satisfies Api['GET /api/chats/:id']['res'])
  })
  .post('/:id', zValidator('json', z.object({ text: z.string().trim().min(1).max(500), attachment: attachment.optional() })), async (c) => {
    const viewer = c.var.me, body = c.req.valid('json')
    if (tooFast(`chat:${viewer.id}`, 1)) return c.json({ error: 'Slow down: that is a lot of messages in one minute' }, 429)
    const { me, rels: [rel] } = await relations(viewer, [c.req.param('id')])
    if (!rel) return c.json({ error: 'not found' }, 404)
    const denied = !rel.thread && cannotStart(viewer, rel.subject, rel.mine, rel.theirs)
    if (denied) return c.json({ error: denied }, 403)
    if (body.attachment && (rel.thread || viewer.kind !== 'sponsor' || !body.attachment.url.startsWith('https://')))
      return c.json({ error: "Only a booth's first message can carry an attachment, and its link must start with https://" }, 400)
    const { doc, message, first } = await send(me, rel, body.text, body.attachment)
    if (first) refreshSoon(ix.threads) // the inbox is a search: without this a new request takes up to 5s to reach the other person
    const [card] = await cards({ ...viewer, starred: me.starred }, [{ ...rel, thread: doc }])
    return c.json({ thread: toThread(doc, viewer.id, card), message: { id: message.id, from: 'me', text: message.text, at: message.at } } satisfies Api['POST /api/chats/:id']['res'])
  })
  .post('/:id/answer', zValidator('json', z.object({ action: z.enum(['accept', 'share', 'ignore', 'mute']), fields: z.array(z.enum(contactFields)).optional() })), async (c) => {
    const viewer = c.var.me, { action, fields } = c.req.valid('json')
    const { me, rels: [rel] } = await relations(viewer, [c.req.param('id')])
    const t = rel?.thread
    if (!t || !visible(t, viewer.id).length) return c.json(none, 404)
    if (t.startedBy === viewer.id || t.status !== 'request') return c.json({ error: 'Only the person who received a request can answer it' }, 403)
    return span('request.answer', { action }, async () => {
      const at = new Date().toISOString(), them = rel.subject, yes = action === 'accept' || action === 'share'
      const doc = { ...t, status: yes ? ('open' as const) : ('ignored' as const), [readKey(t, viewer.id)]: at, ...(action === 'share' && { shared: true }) }
      const [, given] = await Promise.all([
        es.update({ index: ix.threads, id: threadId(viewer.id, them.id), retry_on_conflict: 3, doc: { status: doc.status, shared: doc.shared, [readKey(t, viewer.id)]: at } }),
        // The same hand-over as the Share button: one share doc, one receipt, one count.
        giveCards(action === 'share' ? [{ from: viewer.id, to: them, fields: fields ?? me.shareFields ?? [], via: 'request', note: t.firstText }] : []),
        action === 'mute' && es.index({ index: ix.mutes, id: pairId(viewer.id, them.id), document: { attendee: viewer.id, booth: them.id, at } }),
      ])
      requests.add(1, { action: outcome[action] })
      const [card] = await cards({ ...viewer, starred: me.starred }, [{ ...rel, thread: doc, shareOut: given[0] ?? rel.shareOut, muted: rel.muted || action === 'mute' }])
      return c.json({ thread: toThread(doc, viewer.id, card) } satisfies Api['POST /api/chats/:id/answer']['res'])
    })
  })
