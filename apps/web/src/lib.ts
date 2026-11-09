import { dexTypes, typeOf, type DexType } from '../../api/src/dexTypes'

export { typeOf }
export type Approach = 'open' | 'ask' | 'quiet'

// Icon + words + color, so the meaning never depends on color alone.
export const approaches: Record<Approach, { icon: string; label: string; hint: string }> = {
  open: { icon: '👋', label: 'Open to chat', hint: 'Come say hi anytime.' },
  ask: { icon: '✋', label: 'Ask first', hint: 'Check in before starting a conversation.' },
  quiet: { icon: '🤫', label: 'Quiet mode', hint: 'A wave or a note is best. Please don’t start a long chat.' },
}

/** "a, b ,, a" -> ["a", "b"] */
export const splitList = (s: string) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))]

/** Groups cards by their interest type, in the canonical type order, skipping empty groups. */
export function groupByType<T extends { interests?: { interests: string[] } }>(cards: T[]) {
  const groups = new Map<DexType, T[]>(dexTypes.map((t) => [t, []]))
  for (const c of cards) groups.get(typeOf(c.interests?.interests ?? []))!.push(c)
  return [...groups].filter(([, list]) => list.length)
}

export type ContactField = 'email' | 'linkedin' | 'github'
// Only ever build https/mailto links, so a stored value can't become a javascript: URL.
export const contactHref = (field: ContactField, v: string) =>
  field === 'email' ? `mailto:${v}`
  : field === 'linkedin' ? (/^https:\/\//i.test(v) ? v : `https://www.linkedin.com/in/${encodeURIComponent(v)}`)
  : `https://github.com/${encodeURIComponent(v.replace(/^@/, ''))}`

export const routes = ['scan', 'badge', 'print', 'dex', 'inbox', 'leads'] as const
export type Route = (typeof routes)[number]
export const parseRoute = (hash: string): Route => {
  const r = hash.replace(/^#\/?/, '') as Route
  return routes.includes(r) ? r : 'scan'
}

export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Search-backed lists (the Dex) only see a catch after Elasticsearch's next refresh (~5s on Serverless).
// Cards caught this session fill that gap, newest first, until the server list includes them.
export const mergeRecent = <T extends { id: string }>(server: T[], recent: T[]) => [...recent.filter((r) => !server.some((s) => s.id === r.id)), ...server]
