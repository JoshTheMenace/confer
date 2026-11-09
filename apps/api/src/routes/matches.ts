import { Hono } from 'hono'
import OpenAI from 'openai'
import { auth, type Me } from '../auth.js'
import { es } from '../es.js'
import { buildMatchQuery, peerCard, sharedInterests, templateWhy, toMatch, whyPrompt, type Profile } from '../match.js'
import { log } from '../telemetry.js'

const profile = (id: string) =>
  es.get<Profile>({ index: 'profiles', id, _source_excludes: ['tokenHash'] }).then((r) => r._source, () => undefined)
const whyCache = new Map<string, string>()

export const matches = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .use(async (c, next) => (c.var.me.kind === 'attendee' ? next() : c.json({ error: 'forbidden' }, 403)))
  .get('/', async (c) => {
    const me = (await profile(c.var.me.id)) ?? {}
    const res = await es.search<Profile>(buildMatchQuery({ id: c.var.me.id, ...me }, c.req.query('q')))
    return c.json(res.hits.hits.map((hit) => toMatch(me, hit)))
  })
  .get('/:id/why', async (c) => {
    const id = c.req.param('id')
    const [me, them] = await Promise.all([profile(c.var.me.id), profile(id)])
    if (!me || !them || them.kind !== 'attendee' || !them.discoverable || !them.interestsVisibleTo?.includes('peers')) return c.json({ error: 'not found' }, 404)
    const [mine, theirs] = [peerCard(me), peerCard(them)]
    const key = `${c.var.me.id}:${id}:${JSON.stringify([mine, theirs])}`
    if (!whyCache.has(key)) {
      // Both cards pass the peer consent lens, so OpenAI only sees what a peer could see.
      const ai = process.env.OPENAI_API_KEY &&
        (await new OpenAI().chat.completions
          .create({ model: process.env.OPENAI_MODEL ?? 'gpt-5-mini', reasoning_effort: 'minimal', messages: [{ role: 'user', content: whyPrompt(mine, theirs) }] })
          .then((r) => r.choices[0]?.message.content?.trim(), (err) => void log.warn({ status: err?.status }, 'why: openai failed, using template')))
      whyCache.set(key, ai || templateWhy(theirs, sharedInterests(mine.interests, theirs.interests)))
    }
    return c.json({ why: whyCache.get(key)! })
  })
