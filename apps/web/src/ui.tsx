import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { call, type Api, type Approach, type Common, type Contact, type ContactField, type Me, type Session } from './api'
import { hash } from './Silhouette'

export type AppContext = { session: Session; me: Me; setMe: (me: Me) => void; go: (route: string) => void; say: (msg: string) => void; signOut: () => void }
export const AppCtx = createContext<AppContext>(null!)
export const useApp = () => useContext(AppCtx)
export const param = (name: string) => new URLSearchParams(location.search).get(name)

type LiveKey = 'GET /api/people' | 'GET /api/inbox' | 'GET /api/booth' | 'GET /api/booth/prospects' | 'GET /api/pulse'
/** Fetch now, then every 2 seconds while the page is visible, so the other phone's tap shows up here. */
export function useLive<K extends LiveKey>(session: Session, key: K) {
  const [data, setData] = useState<Api[K]['res']>()
  const [error, setError] = useState('')
  const reload = useCallback(
    () => (call as (s: Session, k: K) => Promise<Api[K]['res']>)(session, key).then((d) => (setData(d), setError('')), (e: Error) => setError(e.message)),
    [session, key],
  )
  useEffect(() => {
    reload()
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), 2000)
    return () => clearInterval(timer)
  }, [reload])
  return { data, error, reload }
}

const shapes = ['<circle cx="8" cy="8" r="7"/>', '<rect x="1.5" y="1.5" width="13" height="13"/>', '<path d="M8 1 15.5 15H.5z"/>', '<path d="M8 0 16 8 8 16 0 8z"/>', '<path d="M1 15A14 14 0 0 1 15 1v14z"/>']
const Shape = ({ n }: { n: number }) => <svg className={`shape c${n % 6}`} viewBox="0 0 16 16" aria-hidden="true" dangerouslySetInnerHTML={{ __html: shapes[n % 5] }} />

/** An interest tag: always the same shape and colour for the same words. */
export const Tag = ({ label }: { label: string }) => <span className="tag"><Shape n={hash(label.toLowerCase())} />{label}</span>

export function CommonList({ common, mine = 'You', theirs = 'Them' }: { common: Common[]; mine?: string; theirs?: string }) {
  if (!common.length) return <p className="muted">Nothing in common yet. Say hi anyway.</p>
  return (
    <section className="common" aria-label="Things in common">
      <h3><span className="count" key={common.length}>{common.length}</span> {common.length === 1 ? 'thing' : 'things'} in common</h3>
      <ul>
        {common.map((c, i) => (
          <li key={c.mine + c.theirs} style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
            {c.kind === 'same' ? <Tag label={c.mine} /> : (
              <span className="pair">
                <span><small>{mine}</small><Tag label={c.mine} /></span>
                <span className="link"><i />related</span>
                <span><small>{theirs}</small><Tag label={c.theirs} /></span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// Icon + words + colour: the meaning never rests on colour alone.
export const approaches: Record<Approach, { label: string; hint: string; shape: number }> = {
  open: { label: 'Open to chat', hint: 'Come say hi anytime.', shape: 0 },
  ask: { label: 'Ask first', hint: 'Check in before starting a conversation.', shape: 2 },
  quiet: { label: 'Quiet mode', hint: 'A wave or a note is best.', shape: 1 },
}
export const ApproachBadge = ({ approach }: { approach: Approach }) => (
  <span className={`approach ${approach}`}><svg viewBox="0 0 16 16" aria-hidden="true" dangerouslySetInnerHTML={{ __html: shapes[approaches[approach].shape] }} />{approaches[approach].label}</span>
)

export function Screen({ title, tone, lede, children }: { title: string; tone: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className={`masthead ${tone}`}>
        <h1 tabIndex={-1}>{title}</h1>
        {lede && <p>{lede}</p>}
      </header>
      <div className="body">{children}</div>
    </>
  )
}

/** A number that rolls when it changes. */
export const Count = ({ n }: { n: number | string }) => <span className="roll" key={n}>{n}</span>

export const fieldNames: Record<ContactField, string> = { email: 'Email', linkedin: 'LinkedIn', github: 'GitHub' }
// Only ever build https/mailto links, so a stored value can't become a javascript: URL.
const href = (f: ContactField, v: string) => (f === 'email' ? `mailto:${v}` : f === 'linkedin' ? `https://www.linkedin.com/in/${encodeURIComponent(v)}` : `https://github.com/${encodeURIComponent(v.replace(/^@/, ''))}`)
export const ContactCard = ({ contact, role }: { contact: Contact; role?: string }) => (
  <dl className="contact">
    {role && <><dt>Role</dt><dd>{role}</dd></>}
    {(Object.keys(contact) as ContactField[]).map((f) => <div key={f}><dt>{fieldNames[f]}</dt><dd><a href={href(f, contact[f]!)}>{contact[f]}</a></dd></div>)}
  </dl>
)

export function FieldPicker({ value, onChange, legend }: { value: ContactField[]; onChange: (v: ContactField[]) => void; legend: string }) {
  return (
    <fieldset className="checks">
      <legend>{legend}</legend>
      {(Object.keys(fieldNames) as ContactField[]).map((f) => (
        <label key={f}><input type="checkbox" checked={value.includes(f)} onChange={(e) => onChange(e.target.checked ? [...value, f] : value.filter((x) => x !== f))} />{fieldNames[f]}</label>
      ))}
    </fieldset>
  )
}

export function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

/** Shrinks a chosen picture to at most 320px JPEG in the browser, so the original never leaves the phone. */
export async function resizePhoto(file: Blob) {
  const img = await createImageBitmap(file), scale = Math.min(1, 320 / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}
