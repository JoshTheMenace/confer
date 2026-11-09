import { createContext, type CSSProperties, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Api, Approach, Attachment, Card, Common, ContactField, Me, Receipt } from '../../api/src/contract'
import { flag, type Session, WROTE } from './api'
import { contactLink, httpsUrl } from './links'
import { silhouetteUrl } from './Silhouette'

type Polled<T> = { data?: T; error?: string; reload: () => Promise<void> }
export type Ctx = { session: Session; me: Me; setMe: (me: Me) => void; route: string; go: (route: string) => void; say: (text: string) => void; signOut: () => void; stage: boolean; inbox: Polled<Api['GET /api/inbox']['res'] | undefined> }
export const AppCtx = createContext<Ctx>(null!)
export const useApp = () => useContext(AppCtx)

export const reducedMotion = () => document.documentElement.classList.contains('rm')
export const fieldNames: Record<ContactField, string> = { email: 'Email', linkedin: 'LinkedIn', github: 'GitHub' }
export const listFields = (fields: ContactField[]) => fields.map((f) => fieldNames[f]).join(', ') || 'nothing'
export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const nameOf = (c: Card) => c.name ?? 'This person'
export const who = (c: Card) => (c.kind === 'sponsor' ? `${c.name} booth` : c.name ?? 'Name not shared')

/** Loads now, every 2 seconds while the page is visible, and right after any write in this page. A failed poll keeps the last data. */
export function usePoll<T>(fn: () => Promise<T>, deps: unknown[]): Polled<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const reload = useCallback(() => fn().then((d) => { setData(d); setError(undefined) }, (e: Error) => setError(e.message)), deps)
  useEffect(() => {
    reload()
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), 2000)
    addEventListener(WROTE, reload)
    return () => { clearInterval(t); removeEventListener(WROTE, reload) }
  }, [reload])
  return { data, error, reload }
}

/** One write at a time: pending while it runs, a readable error if it fails, and the same call again on retry. */
export function useAct() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const last = useRef<() => Promise<unknown>>(undefined)
  const run = (fn: () => Promise<unknown>) => {
    last.current = fn
    setBusy(true)
    setError(undefined)
    return fn().then(() => setBusy(false), (e: Error) => { setBusy(false); setError(e.message || 'That did not go through.') })
  }
  return { busy, error, run, retry: () => { if (last.current) run(last.current) } }
}

export const Problem = ({ error, retry }: { error?: string; retry?: () => void }) => (error ? (
  <p role="alert" className="problem">{error}{retry && <button type="button" className="btn" onClick={retry}>Try again</button>}</p>
) : null)

const paths = {
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  people: 'M5.500 8a3.500 3.500 0 1 0 7 0a3.500 3.500 0 1 0-7 0M2.500 20a6.500 6.500 0 0 1 13 0M16 4.800a3.500 3.500 0 0 1 0 6.400M18 14.500a6.500 6.500 0 0 1 3.500 5.500',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  discover: 'M4.500 11a6.500 6.500 0 1 0 13 0a6.500 6.500 0 1 0-13 0M16 16l5 5',
  me: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9.500 10a2.500 2.500 0 1 0 5 0a2.500 2.500 0 1 0-5 0M8.500 17.500a3.500 3.500 0 0 1 7 0',
  leads: 'M4 12.500l5 5L20 6.500',
  booth: 'M3 10l1.500-5h15L21 10zM4.500 10v10h15V10M9.500 20v-6h5v6',
  pulse: 'M2 12h5l2.500-7 4 14 2.500-7h6',
  clip: 'M20 11l-8 8a5 5 0 0 1-7-7l8.500-8.500a3.500 3.500 0 0 1 5 5L10 17a2 2 0 0 1-3-3l7.500-7.500',
  back: 'M14 5l-7 7 7 7',
} as const
export type IconName = keyof typeof paths
export const Icon = ({ name }: { name: IconName }) => (
  <svg className="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
)

// Icon + words + colour: the meaning never rests on colour alone.
const approaches: Record<Approach, [string, string]> = { open: ['👋', 'Open to chat'], ask: ['✋', 'Ask first'], quiet: ['🤫', 'Quiet mode: a wave is best'] }
export const ApproachChip = ({ approach }: { approach: Approach }) => (
  <span className={`approach ${approach}`}><span aria-hidden>{approaches[approach][0]}</span> {approaches[approach][1]}</span>
)
export const approachLabel = (a: Approach) => approaches[a][1]

/** A number that rolls to its new value (jumps under reduced motion). */
export function Count({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0)
  const from = useRef(shown)
  useEffect(() => {
    if (reducedMotion()) return setShown(value)
    const a = from.current
    let k = 0
    const t = setInterval(() => {
      k = Math.min(1, k + 1 / 18) // 18 ticks of 33ms: about 600ms, ease-out
      setShown((from.current = a + (value - a) * (1 - (1 - k) ** 3)))
      if (k === 1) clearInterval(t)
    }, 33)
    return () => clearInterval(t)
  }, [value])
  return <span className="count">{format(shown)}</span>
}

/** Things in common: chips pop in one by one; a related pair is two different tags joined by a drawn link. */
export function CommonList({ common, them = 'Them' }: { common: Common[]; them?: string }) {
  if (!common.length) return <p className="muted">Nothing in common yet. Say hi anyway.</p>
  return (
    <section className="common" aria-label="Things in common">
      <h3><Count value={common.length} /> {common.length === 1 ? 'thing' : 'things'} in common</h3>
      <ul>
        {common.map((c, i) => (
          <li key={c.mine + c.theirs} style={{ '--i': i } as CSSProperties} className={c.kind}>
            {c.kind === 'same' ? <span className="chip">{c.mine}</span> : (
              <>
                <span className="chip"><small>You</small>{c.mine}</span>
                <span className="link"><i aria-hidden /><em>related</em></span>
                <span className="chip"><small>{them}</small>{c.theirs}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The short form for a request or a chat header: a related pair reads "mine ~ theirs". */
export const Why = ({ common }: { common: Common[] }) => (common.length ? (
  <p className="why"><span>In common:</span>{common.map((c) => <span key={c.mine + c.theirs} className="chip">{c.kind === 'related' ? `${c.mine} ~ ${c.theirs}` : c.mine}</span>)}</p>
) : null)

/**
 * The reveal. The silhouette sits underneath; when `theyShared` arrives the photo wipes up over the bust in one
 * continuous move, and wipes back down on Unshare. `?reveal=0.5` freezes it part-way.
 */
export function Portrait({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' | 'lg' }) {
  const photo = card.theyShared?.photo
  const [kept, setKept] = useState(photo) // the picture stays in place while it wipes away
  useEffect(() => {
    if (photo) return setKept(photo)
    const t = setTimeout(() => setKept(undefined), 1000)
    return () => clearTimeout(t)
  }, [photo])
  const freeze = size === 'lg' && photo ? flag('reveal') : null
  const shown = photo ?? kept
  return (
    <span className={`portrait ${size} ${photo ? 'on' : ''} ${freeze ? 'frozen' : ''}`} role="img" aria-label={photo ? `Photo of ${nameOf(card)}` : `Silhouette of ${nameOf(card)}: no photo shared`} style={freeze ? ({ '--p': freeze } as CSSProperties) : undefined}>
      <img src={silhouetteUrl(card.id)} alt="" />
      <span className="photo">{shown && <img src={shown} alt="" />}</span>
    </span>
  )
}

/** The badge on its lanyard: strap, clip, punched slot, paper card. */
export function Badge({ children, swing, className = '' }: { children: ReactNode; swing?: boolean; className?: string }) {
  return (
    <div className={`badge ${swing ? 'swing' : ''} ${className}`}>
      <span className="strap" aria-hidden /><span className="slot" aria-hidden />
      {children}
    </div>
  )
}

export const Stamp = ({ children }: { children: ReactNode }) => <span className="stamp">{children}</span>

/** What a booth's request carries. Shown as plain text when the link is not https. */
export function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const href = httpsUrl(attachment.url)
  const inner = <><Icon name="clip" /> {attachment.label}<small>Yours either way</small></>
  return href ? <a className="attach" href={href} target="_blank" rel="noreferrer">{inner}</a> : <p className="attach">{inner}</p>
}

/** The contact card someone shared: each value is a safe link where one can be built. */
export function ContactCard({ they }: { they: NonNullable<Card['theyShared']> }) {
  return (
    <dl className="contact">
      {they.fields.filter((f) => they.contact[f]).map((f) => {
        const { text, href } = contactLink(f, they.contact[f]!)
        return <div key={f}><dt>{fieldNames[f]}</dt><dd>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</dd></div>
      })}
    </dl>
  )
}

/** Printed after Unshare. Honest about the limit: Confer deletes its copy, it cannot reach into theirs. */
export function ReceiptSlip({ receipt, name }: { receipt: Receipt; name: string }) {
  return (
    <div className="printer" role="status">
      <div className="slip">
        <b>Deletion receipt</b>
        <p>Removed from Confer for {name}: {listFields(receipt.fields)}, photo.</p>
        <p>A copy they already made cannot be recalled.</p>
        <p>{time(receipt.at)}{receipt.traceId && ` · trace ${receipt.traceId.slice(0, 8)}`}</p>
      </div>
    </div>
  )
}

export function FieldPicker({ value, onChange, legend }: { value: ContactField[]; onChange: (v: ContactField[]) => void; legend: string }) {
  return (
    <fieldset className="checks">
      <legend>{legend}</legend>
      {(Object.keys(fieldNames) as ContactField[]).map((f) => (
        <label key={f}><input type="checkbox" checked={value.includes(f)} onChange={(e) => onChange(e.target.checked ? [...value, f] : value.filter((x) => x !== f))} /> {fieldNames[f]}</label>
      ))}
    </fieldset>
  )
}

// Small pieces the booth and organizer screens share.
export const pct = (n: number) => `${Math.round(n * 100)}%`
export const Stat = ({ label, value, format }: { label: string; value: number; format?: (n: number) => string }) => (
  <div className="stat"><b><Count value={value} format={format} /></b><span>{label}</span></div>
)
export const Bars = ({ terms }: { terms: { term: string; count: number }[] }) => (
  <ul className="bars">{terms.map((t) => <li key={t.term}><span>{t.term}</span><i style={{ '--w': t.count / Math.max(...terms.map((x) => x.count)) } as CSSProperties} /><b>{t.count}</b></li>)}</ul>
)
