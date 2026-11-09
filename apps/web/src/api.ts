import type { Api } from '../../api/src/contract'

export type * from '../../api/src/contract'

/** One signed-in phone. Stage mode runs two of these side by side. */
export type Session = { slot: string; token: string | null }

type Opts<K extends keyof Api> = (Api[K] extends { body: infer B } ? { body: B } : { body?: undefined }) &
  (Api[K] extends { query: infer Q } ? { query?: Q } : { query?: undefined }) &
  (K extends `${string}:id${string}` ? { params: { id: string } } : { params?: undefined })
type Args<K extends keyof Api> = object extends Opts<K> ? [opts?: Opts<K>] : [opts: Opts<K>]

const search = typeof location === 'undefined' ? '' : location.search
export const isMock = new URLSearchParams(search).has('mock') || !!import.meta.env?.VITE_MOCK

/** 'POST /api/people/:id/share' + { id: 'p 1' } -> '/api/people/p%201/share' */
export function buildPath(key: keyof Api, params?: { id: string }, query?: Record<string, string | undefined>) {
  const path = key.slice(key.indexOf(' ') + 1).replace(':id', encodeURIComponent(params?.id ?? ''))
  const qs = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1])).toString()
  return qs ? `${path}?${qs}` : path
}

export async function call<K extends keyof Api>(session: Session, key: K, ...[opts]: Args<K>): Promise<Api[K]['res']> {
  const { body, params, query } = (opts ?? {}) as { body?: unknown; params?: { id: string }; query?: Record<string, string | undefined> }
  if (isMock) return (await import('./mock/server')).handle(session.token, key, { body, params, query })
  const res = await fetch(buildPath(key, params, query), {
    method: key.slice(0, key.indexOf(' ')),
    headers: { ...(session.token && { Authorization: `Bearer ${session.token}` }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`)
  return res.json()
}

// Tokens live under a per-slot key; memory covers private windows where localStorage throws.
const memory = new Map<string, string>()
const keyOf = (slot: string) => `confer.token.${slot}`
export function loadToken(slot: string) {
  try { return localStorage.getItem(keyOf(slot)) ?? memory.get(slot) ?? null } catch { return memory.get(slot) ?? null }
}
export function saveToken(slot: string, token: string | null) {
  if (token) memory.set(slot, token); else memory.delete(slot)
  try { if (token) localStorage.setItem(keyOf(slot), token); else localStorage.removeItem(keyOf(slot)) } catch { /* memory only */ }
}
