import type { Api } from '../../api/src/contract'

export type * from '../../api/src/contract'
export { contactFields } from '../../api/src/contract'
export type Session = { slot: string; token: string }
type Loose = { params?: Record<string, string>; body?: unknown; query?: Record<string, string | undefined> }
type Opts<K extends keyof Api> = (K extends `${string}/:id${string}` ? { params: { id: string } } : unknown) &
  (Api[K] extends { body: infer B } ? { body: B } : unknown) &
  (Api[K] extends { query: infer Q } ? { query: Q } : unknown)
type Args<K extends keyof Api> = unknown extends Opts<K> ? [] : [opts: Opts<K>]

/** The demo personas. The same tokens sign in against the real API and the mock. */
export const personas = {
  amara: { label: 'Amara', token: 'demo-500' },
  diego: { label: 'Diego', token: 'demo-501' },
  elastic: { label: 'Elastic booth', token: 'demo-580' },
  organizer: { label: 'Organizer', token: 'demo-590' },
}
export type Persona = keyof typeof personas

const search = new URLSearchParams(globalThis.location?.search)
export const param = (k: string) => search.get(k)
export const isMock = search.has('mock') || !!import.meta.env.VITE_MOCK

// One token per session slot, in localStorage with a memory fallback (private mode, blocked storage).
const memory = new Map<string, string>()
export const loadToken = (slot: string) => {
  try { return localStorage.getItem(`confer.token.${slot}`) ?? memory.get(slot) ?? '' } catch { return memory.get(slot) ?? '' }
}
export const saveToken = (slot: string, token: string) => {
  memory.set(slot, token)
  try { token ? localStorage.setItem(`confer.token.${slot}`, token) : localStorage.removeItem(`confer.token.${slot}`) } catch { /* memory only */ }
}

/** 'POST /api/people/:id/share' + { id: 'a b' } -> '/api/people/a%20b/share' */
export function buildPath(key: string, { params = {}, query = {} }: Loose = {}) {
  const path = key.slice(key.indexOf(' ') + 1).replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k]))
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1])).toString()
  return qs ? `${path}?${qs}` : path
}

/** The one way the app talks to the API. Typed by the contract; throws a readable Error (with `status`) on failure. */
export async function call<K extends keyof Api>(session: Session | null, key: K, ...[opts]: Args<K>): Promise<Api[K]['res']> {
  const o = (opts ?? {}) as Loose
  if (isMock) return (await import('./mock/server')).mock(session?.token, key, o)
  const res = await fetch(buildPath(key, o), {
    method: key.split(' ')[0],
    headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(typeof data.error === 'string' ? data.error : `Something went wrong (${res.status}).`), { status: res.status })
  return data
}
