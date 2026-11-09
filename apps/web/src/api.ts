import type { Api } from '../../api/src/contract'

export type Session = { slot: string; token: string | null }
type Opts<K extends keyof Api> = { params?: Record<string, string> } & (Api[K] extends { body: infer B } ? { body: B } : object) & (Api[K] extends { query: infer Q } ? { query?: Q } : object)

const search = new URLSearchParams(globalThis.location?.search)
/** A deep-link flag from the page URL, e.g. `?mock&as=amara&demo=shared`. */
export const flag = (name: string) => search.get(name)
export const isMock = search.has('mock') || !!import.meta.env?.VITE_MOCK

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
  if (isMock) return (await import('./mock/server')).mock.call(session.token, route, o as never)
  const res = await fetch(buildPath(route, o.params, o.query), {
    method: route.slice(0, route.indexOf(' ')),
    headers: { ...(session.token && { Authorization: `Bearer ${session.token}` }), ...(o.body !== undefined && { 'Content-Type': 'application/json' }) },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? (res.status === 401 ? 'Please sign in again.' : `Something went wrong (${res.status}). Try again.`))
  return data
}
