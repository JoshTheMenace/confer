import { hc } from 'hono/client'
import type { AppType } from '../../api/src/app'

// Token lives in localStorage, with a memory fallback for private mode / blocked storage.
const KEY = 'dex.token'
let memory = ''
export const getToken = () => { try { return localStorage.getItem(KEY) ?? memory } catch { return memory } }
export const setToken = (t: string) => { memory = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch { /* memory only */ } }

// End-to-end typed client: change an API route and the web build breaks, not production.
export const api = hc<AppType>('/', { headers: (): Record<string, string> => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) })

/** Await a typed call: returns the success body, throws a readable Error otherwise. */
export async function call<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(p: Promise<R>) {
  const r = await p
  const body = (await r.json().catch(() => ({}))) as { error?: unknown }
  if (!r.ok) throw Object.assign(new Error(typeof body.error === 'string' ? body.error : `Something went wrong (${r.status})`), { status: r.status })
  return body as Exclude<Awaited<ReturnType<R['json']>>, { error: unknown }>
}

export type Me = Awaited<ReturnType<typeof call<Awaited<ReturnType<typeof api.api.me.$get>>>>>['me']
export type { DexType } from '../../api/src/dexTypes'
