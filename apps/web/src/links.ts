import type { Card, ContactField } from '../../api/src/contract'

/** An https link or nothing: whatever a profile holds, the app never builds a link with another scheme. */
export const httpsUrl = (value?: string) => {
  try { return value && new URL(value).protocol === 'https:' ? value : undefined } catch { return undefined }
}

const sites: Record<Exclude<ContactField, 'email'>, [host: string, base: string]> = { linkedin: ['linkedin.com', 'https://www.linkedin.com/in/'], github: ['github.com', 'https://github.com/'] }

/** People type a handle, `@handle`, `in/handle` or a whole URL. All become one safe link and one short text. */
export function contactLink(field: ContactField, raw: string): { text: string; href?: string } {
  const value = raw.trim()
  if (field === 'email') return { text: value, href: /^[^\s@<>:]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? `mailto:${value}` : undefined }
  const [host, base] = sites[field]
  let handle = value
  if (/^(https?:)?\/\//i.test(value) || value.toLowerCase().includes(host)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/\//, '')}`)
      if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) return { text: value }
      handle = url.pathname
    } catch { return { text: value } }
  } else if (value.includes(':')) return { text: value } // some other scheme: show it, never link it
  handle = handle.replace(/^\/+|\/+$/g, '').replace(/^in\//, '').replace(/^@/, '')
  return /^[\w.%-]+$/.test(handle) ? { text: handle, href: base + handle } : { text: value }
}

/** Where my conversation with this person stands, as the one word shown on their card. */
export function threadState(card: Pick<Card, 'thread'>): 'Connect' | 'Request sent' | 'Reply' | 'Chat' {
  const t = card.thread
  if (!t) return 'Connect'
  if (t.status === 'open') return 'Chat'
  return t.startedBy === 'me' ? 'Request sent' : 'Reply'
}

/** Two or three first lines built from what the two have in common; always editable. */
export function openers(card: Pick<Card, 'common' | 'name'>): string[] {
  const related = card.common.find((c) => c.kind === 'related'), same = card.common.find((c) => c.kind === 'same')
  return [
    related && `Your ${related.theirs} meets my ${related.mine}. Swap stories?`,
    same && `Both into ${same.mine}. Compare notes?`,
    'Good to meet you. Coffee later?',
  ].filter((s): s is string => !!s)
}
