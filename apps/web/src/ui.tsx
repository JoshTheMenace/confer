import { createContext, type CSSProperties, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Approach, Card, Common, ContactField, Me } from '../../api/src/contract'
import { flag, type Session } from './api'
import { silhouetteUrl } from './Silhouette'

export type Ctx = { session: Session; me: Me; setMe: (me: Me) => void; route: string; go: (route: string) => void; say: (text: string) => void; signOut: () => void }
export const AppCtx = createContext<Ctx>(null!)
export const useApp = () => useContext(AppCtx)

export const reducedMotion = () => document.documentElement.classList.contains('rm')
export const fieldNames: Record<ContactField, string> = { email: 'Email', linkedin: 'LinkedIn', github: 'GitHub' }
export const listFields = (fields: ContactField[]) => fields.map((f) => fieldNames[f]).join(', ') || 'nothing'
export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const nameOf = (c: Card) => c.name ?? 'Someone (name not shared)'

/** Loads now, then every 2 seconds while the page is visible. */
export function usePoll<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => fn().then((d) => { setData(d); setError(undefined) }, (e: Error) => setError(e.message)), deps)
  useEffect(() => {
    reload()
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), 2000)
    return () => clearInterval(t)
  }, [reload])
  return { data, error, reload }
}

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

/**
 * The reveal. Six paper slats, silhouette on the front and photo on the back, turn over left to right
 * when `theyShared` arrives, and turn back on Unshare. `?reveal=0.5` freezes it part-way.
 */
export function Portrait({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' | 'lg' }) {
  const photo = card.theyShared?.photo
  const last = useRef(photo)
  if (photo) last.current = photo // keep the picture on the back while it turns away
  const freeze = size === 'lg' ? flag('reveal') : null
  const label = photo ? `Photo of ${nameOf(card)}` : `Silhouette of ${nameOf(card)}: no photo shared`
  return (
    <span className={`portrait ${size} ${photo ? 'on' : ''} ${freeze ? 'frozen' : ''}`} role="img" aria-label={label} style={freeze ? ({ '--p': freeze } as CSSProperties) : undefined}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="slat" style={{ '--i': i } as CSSProperties}>
          <i style={{ backgroundImage: `url("${silhouetteUrl(card.id)}")` }} />
          <i className="back" style={last.current ? { backgroundImage: `url("${last.current}")` } : undefined} />
        </span>
      ))}
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

export const Problem = ({ error }: { error?: string }) => (error ? <p role="alert" className="problem">{error}</p> : null)
