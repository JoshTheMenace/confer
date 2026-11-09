import { zValidator } from '@hono/zod-validator'
import { trace } from '@opentelemetry/api'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { auth, type Me } from '../auth.js'
import { sources, threadId, type ThreadDoc } from '../consent.js'
import type { Api, Profile } from '../contract.js'
import { discoverSearches, prospectSearch, toDiscover, toProspect, type DiscoverHits } from '../discover.js'
import { es, ix } from '../es.js'
import { log, span } from '../telemetry.js'

type Env = { Variables: { me: Me } }
type Doc = Omit<Profile, 'id'>
const profile = (id: string, fields: string[]) => es.get<Doc>({ index: ix.profiles, id, _source_includes: fields }).then((r) => r._source!)

export const discover = new Hono<Env>().get('/', auth, zValidator('query', z.object({ q: z.string().trim().max(300).optional() })), async (c) => {
  const id = c.var.me.id, q = c.req.valid('query').q || undefined
  const mine = profile(id, ['interests', 'lookingFor', 'stuckOn', 'starred'])
  // Free text doesn't depend on my profile, so the search runs alongside the profile read instead of after it.
  const { text, searches } = discoverSearches({ id, ...(q ? {} : await mine) }, q)
  const [me, hits] = await Promise.all([mine, span('discover', { freeText: !!q }, async () => {
    const { responses } = await es.msearch({ searches })
    // One failed search (say, the reranker is down) costs its section, not the whole page.
    const [talks, booths, people] = responses.map((r) => ('hits' in r ? r.hits.hits : (log.warn({ status: r.status }, 'discover: a search failed'), [])))
    trace.getActiveSpan()?.setAttributes({ 'discover.talks': talks.length, 'discover.booths': booths.length, 'discover.people': people.length })
    // "Suggest me to other attendees" is a promise about attendees: a booth meets people through prospects, where names stay hidden.
    return [talks, booths, c.var.me.kind === 'attendee' ? people : []] as DiscoverHits
  })])
  return c.json(toDiscover({ id, ...me }, text, hits, !!q) satisfies Api['GET /api/discover']['res'])
})

const star = (on: boolean) => async (c: Context<Env, '/:id/star'>) => {
  const id = c.req.param('id')
  const booth = await es.get<Doc>({ index: ix.profiles, id, _source_includes: ['kind'] }, { ignore: [404] })
  if (booth._source?.kind !== 'sponsor') return c.json({ error: 'not found' }, 404)
  // One script for star and unstar; running either twice changes nothing.
  const source = 'def s = ctx._source.starred ?: []; s.removeIf(x -> x == params.id); if (params.on) s.add(params.id); ctx._source.starred = s'
  await es.update({ index: ix.profiles, id: c.var.me.id, script: { source, params: { id, on } } })
  return c.json({ starred: on } satisfies Api['PUT /api/booths/:id/star']['res'])
}
export const booths = new Hono<Env>().put('/:id/star', auth, star(true)).delete('/:id/star', auth, star(false))

/** Mounted beside the booth dashboard at `/api/booth`, so auth sits on the route, not the whole router. */
export const prospects = new Hono<Env>().get('/prospects', auth, async (c) => {
  const id = c.var.me.id
  if (c.var.me.kind !== 'sponsor') return c.json({ error: 'forbidden' }, 403)
  const [booth, seen] = await Promise.all([
    profile(id, ['interests', 'about']),
    es.msearch<{ scanned?: string; attendee?: string }>({ searches: [
      { index: ix.meetings }, { size: 1000, _source: ['scanned'], query: { term: { scanner: id } } },
      { index: ix.mutes }, { size: 1000, _source: ['attendee'], query: { term: { booth: id } } },
    ] }),
  ])
  // Unlike Discover, a failed lookup here must not degrade: it would show a booth people who muted it.
  const exclude = seen.responses.flatMap((r) => {
    if (!('hits' in r)) throw new Error(`prospects: lookup failed with ${r.status}`)
    return r.hits.hits.map((h) => h._source!.scanned ?? h._source!.attendee!)
  })
  const hits = (await es.search<Doc>(prospectSearch({ id, ...booth }, exclude))).hits.hits
  // Read by id, so a request sent a second ago already shows as sent.
  const threads: (ThreadDoc | undefined)[] = await sources(hits.map((h) => ({ _index: ix.threads, _id: threadId(id, h._id!) })))
  return c.json({
    prospects: hits.map((h, i) => {
      const t = threads[i]
      return { ...toProspect(h, i), ...(t?.startedBy === id && { request: { status: t.status, note: t.firstText, sentAt: t.createdAt } }) }
    }),
  } satisfies Api['GET /api/booth/prospects']['res'])
})
