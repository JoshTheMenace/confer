import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { approaches, contactHref, type Approach, type ContactField } from './lib'

/** Loads data on mount; `reload` refetches. Errors become a readable message. */
export function useLoad<T>(load: () => Promise<T>) {
  const latest = useRef(load)
  latest.current = load // reload always uses the newest closure (e.g. the current search text)
  const [state, setState] = useState<{ data?: T; error?: string }>({})
  const reload = useCallback(() => latest.current().then((data) => setState({ data }), (e: Error) => setState({ error: e.message })), [])
  useEffect(() => void reload(), [reload])
  return { ...state, reload }
}

export const Problem = ({ error }: { error?: string }) => (error ? <p role="alert" className="alert">{error}</p> : null)
export const Loading = ({ what }: { what: string }) => <p role="status" className="muted">Loading {what}…</p>

function EnvelopeIcon({ sealed }: { sealed?: boolean }) {
  return (
    <svg viewBox="0 0 120 80" aria-hidden>
      <rect x="3" y="3" width="114" height="74" rx="8" fill="var(--tone-bg)" stroke="var(--tone)" strokeWidth="5" />
      <path d="M6 8 L60 46 L114 8" fill="none" stroke="var(--tone)" strokeWidth="5" strokeLinejoin="round" />
      {sealed && <circle cx="60" cy="46" r="13" fill="var(--tone)" />}
    </svg>
  )
}

const envelopes = [
  { tone: 'green', name: 'Badge', what: 'Name, pronouns, how to approach you', who: 'Shown to anyone who scans you' },
  { tone: 'yellow', name: 'Interests', what: 'Role, topics, what you’re looking for', who: 'Only the groups you pick' },
  { tone: 'red', name: 'Contact', what: 'Email, LinkedIn, GitHub', who: 'Sealed until you say yes' },
] as const

/** The three envelopes, in plain words. */
export const Envelopes = () => (
  <ul className="envelopes">
    {envelopes.map((e) => (
      <li key={e.tone} className={e.tone}>
        <EnvelopeIcon sealed={e.tone === 'red'} />
        <strong>{e.name}</strong>
        <span>{e.what}.</span> <span className="muted">{e.who}.</span>
      </li>
    ))}
  </ul>
)

export function ApproachBadge({ approach, big }: { approach: Approach; big?: boolean }) {
  const a = approaches[approach]
  return (
    <p className={`approach approach-${approach}${big ? ' big' : ''}`}>
      <span aria-hidden>{a.icon}</span> {a.label}{big && <span className="sr-only">. {a.hint}</span>}
    </p>
  )
}


export const Chips = ({ items, label, shared = [] }: { items: string[]; label: string; shared?: string[] }) => (
  <ul className="row chips" aria-label={label}>
    {items.map((i) => <li key={i} className={`chip${shared.includes(i) ? ' shared' : ''}`}>{shared.includes(i) && <span aria-hidden>★ </span>}{i}</li>)}
  </ul>
)

/** Stands in for the v1 screens whose API routes are gone; the Silhouette redesign replaces them. */
export const Rebuilding = () => <p role="status" className="muted">This screen is being rebuilt.</p>
