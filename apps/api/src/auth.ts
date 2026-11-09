import { createHash } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { es } from './es.js'

export type Me = { id: string; kind: 'attendee' | 'sponsor'; tagId: number; displayName: string }
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// Hackathon-grade auth: signup mints a random bearer token; only its hash is stored on the profile.
export const auth = createMiddleware<{ Variables: { me: Me } }>(async (c, next) => {
  const token = c.req.header('authorization')?.replace(/^Bearer /, '')
  const res = token && (await es.search<Me>({ index: 'profiles', size: 1, query: { term: { tokenHash: hashToken(token) } } }))
  const hit = res && res.hits.hits[0]
  if (!hit) return c.json({ error: 'unauthorized' }, 401)
  c.set('me', { ...hit._source!, id: hit._id! })
  await next()
})
