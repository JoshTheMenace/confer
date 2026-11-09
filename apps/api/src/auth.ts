import { createHash } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import type { Kind } from './contract.js'
import { es, ix } from './es.js'

export type Me = { id: string; kind: Kind; tagId: number }
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const tokenLink = (tokenHash: string, me: Me) => ({ index: ix.tokens, id: tokenHash, document: { profile: me.id, kind: me.kind, tagId: me.tagId } })

// Hackathon-grade auth: signup mints a random bearer token; only its hash is stored.
// The hash is the id of a `tokens` doc, so login is a real-time GET: a brand-new account works on its very
// next request without waiting for a search refresh (5s on Serverless, found by Dash0 Agent0).
async function resolve(tokenHash: string): Promise<Me | undefined> {
  const link = await es.get<{ profile: string; kind: Kind; tagId: number }>({ index: ix.tokens, id: tokenHash }, { ignore: [404] })
  if (link._source) return { id: link._source.profile, kind: link._source.kind, tagId: link._source.tagId }
  // Accounts created before the tokens index: find once by search, then link for next time.
  const hit = (await es.search<Me>({ index: ix.profiles, size: 1, _source: ['kind', 'tagId'], query: { term: { tokenHash } } })).hits.hits[0]
  if (!hit) return
  const me = { ...hit._source!, id: hit._id! }
  await es.index(tokenLink(tokenHash, me))
  return me
}

export const auth = createMiddleware<{ Variables: { me: Me } }>(async (c, next) => {
  const token = c.req.header('authorization')?.replace(/^Bearer /, '')
  const me = token && (await resolve(hashToken(token)))
  if (!me) return c.json({ error: 'unauthorized' }, 401)
  c.set('me', me)
  await next()
})
