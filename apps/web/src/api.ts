import type { Api } from '../../api/src/contract'

export type Session = { slot: string; token: string | null }
type Opts<K extends keyof Api> = { params?: Record<string, string> } & (Api[K] extends { body: infer B } ? { body: B } : object) & (Api[K] extends { query: infer Q } ? { query?: Q } : object)

const search = new URLSearchParams(globalThis.location?.search)
/** A deep-link flag from the page URL, e.g. `?mock&as=amara&demo=shared`. */
export const flag = (name: string) => search.get(name)
export const isMock = search.has('mock') || !!import.meta.env?.VITE_MOCK

/** The four demo sign-ins. The same tokens work against the real API and the mock. */
export const personas = { amara: ['Amara', 'demo-500'], diego: ['Diego', 'demo-501'], booth: ['Elastic booth', 'demo-580'], organizer: ['Organizer', 'demo-590'] } as const
export type Persona = keyof typeof personas

// One token per slot, so two personas can run side by side. Memory covers private mode, where localStorage throws.
const memory = new Map<string, string>()
const key = (slot: string) => `confer.token.${slot}`
export const loadToken = (slot: string) => {
  try { return localStorage.getItem(key(slot)) ?? memory.get(slot) ?? null } catch { return memory.get(slot) ?? null }
}
export const saveToken = (slot: string, token: string | null) => {
  token ? memory.set(slot, token) : memory.delete(slot)
  try { token ? localStorage.setItem(key(slot), token) : localStorage.removeItem(key(slot)) } catch { /* memory already has it */ }
}

/** `'GET /api/people/:id'` + params + query -> `/api/people/p1?q=x`. */
export function buildPath(route: string, params: Record<string, string> = {}, query: Record<string, string | undefined> = {}) {
  const path = route.slice(route.indexOf(' ') + 1).replace(/:(\w+)/g, (_, name: string) => {
    if (params[name] === undefined) throw new Error(`Missing "${name}" for ${route}`)
    return encodeURIComponent(params[name])
  })
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1])).toString()
  return qs ? `${path}?${qs}` : path
}

/** The one way the app talks to the server: typed by the contract, real fetch or the in-memory mock. */
export async function call<K extends keyof Api>(session: Session, route: K, ...[opts]: object extends Opts<K> ? [opts?: Opts<K>] : [opts: Opts<K>]): Promise<Api[K]['res']> {
  const o = (opts ?? {}) as { params?: Record<string, string>; body?: unknown; query?: Record<string, string | undefined> }
  const data = await (isMock ? (await import('./mock/server')).mock.call(session.token, route, o as never) : send(session, route, o))
  if (!route.startsWith('GET')) globalThis.dispatchEvent?.(new Event(WROTE))
  return data
}

/** The booth's CSV export: text, not JSON, and Kubernetes' verdict rides in the response headers. */
export async function exportCsv(session: Session) {
  const route = 'GET /api/booth/export'
  let out: { csv: string; name: string; gate: string | null; exported: number; denied: number }
  if (isMock) {
    const csv = (await import('./mock/server')).mock.call(session.token, route)
    out = { csv, name: 'confer-leads-sample.csv', gate: 'kubernetes', exported: csv.trim().split('\n').length - 1, denied: 0 }
  } else {
    const res = await fetch(buildPath(route), { headers: { Authorization: `Bearer ${session.token}` } }).catch(() => { throw new Error('No connection. Check the network and try again.') })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `The export did not go through (${res.status}). Try again.`)
    const h = res.headers
    out = { csv: await res.text(), name: /filename="?([^";]+)/.exec(h.get('Content-Disposition') ?? '')?.[1] ?? 'confer-leads.csv', gate: h.get('X-Confer-Gate'), exported: Number(h.get('X-Confer-Exported')), denied: Number(h.get('X-Confer-Denied')) }
  }
  globalThis.dispatchEvent?.(new Event(WROTE)) // the attendee's receipt shows up at once
  return out
}

/** Fired after every write, so every poll in the page (both phones on Stage) refreshes at once instead of up to 2 seconds later. */
export const WROTE = 'confer:wrote'

async function send(session: Session, route: string, o: { params?: Record<string, string>; body?: unknown; query?: Record<string, string | undefined> }) {
  const res = await fetch(buildPath(route, o.params, o.query), {
    method: route.slice(0, route.indexOf(' ')),
    headers: { ...(session.token && { Authorization: `Bearer ${session.token}` }), ...(o.body !== undefined && { 'Content-Type': 'application/json' }) },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  }).catch(() => { throw new Error('No connection. Check the network and try again.') })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : res.status === 401 ? 'Please sign in again.' : `Something went wrong (${res.status}). Try again.`)
  if (data === null) throw new Error('The server did not answer properly. Try again.') // a proxy's HTML page, not the API
  return data
}
