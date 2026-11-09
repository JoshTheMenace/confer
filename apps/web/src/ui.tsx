import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { Card } from './api'
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

/** One person, shown only through what the API's consent lens let through. */
export function PersonCard({ card, viewer, children, className = '' }: { card: Card; viewer: 'attendee' | 'sponsor'; children?: ReactNode; className?: string }) {
  const { badge, interests, contact } = card
  const open = Object.entries(contact ?? {}).filter(([, v]) => v) as [ContactField, string][]
  return (
    <article className={`card ${className}`} aria-labelledby={`p-${card.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 id={`p-${card.id}`}>{badge.displayName}{card.kind === 'sponsor' && ' (sponsor)'}</h3>
        <span className="muted">#{card.tagId}{badge.pronouns && ` · ${badge.pronouns}`}</span>
      </div>
      <ApproachBadge approach={badge.approach} big />
      {badge.commPref && <p><span aria-hidden>💬 </span><strong>{badge.commPref}</strong></p>}
      {interests ? (
        <>
          {interests.role && <p>{interests.role}</p>}
          {!!interests.interests.length && <Chips items={interests.interests} label="Interests" />}
          {!!interests.lookingFor.length && <p><span className="muted">Looking for:</span> {interests.lookingFor.join(', ')}</p>}
          {interests.about && <p>{interests.about}</p>}
        </>
      ) : card.kind === 'attendee' && <p className="muted">Interests are private.</p>}
      {card.kind === 'attendee' && (open.length ? (
        <>
          <p className="unlocked"><span aria-hidden>🔓 </span>Contact unlocked</p>
          <ul className="contact">{open.map(([k, v]) => <li key={k}><a href={contactHref(k, v)} target="_blank" rel="noreferrer">{k}: {v}</a></li>)}</ul>
        </>
      ) : (
        <p className="sealed"><span aria-hidden>🔒 </span>
          {viewer === 'sponsor' ? 'Contact sealed. They decide in their inbox.' : 'Contact sealed. It opens when you catch each other.'}
        </p>
      ))}
      {children}
    </article>
  )
}
