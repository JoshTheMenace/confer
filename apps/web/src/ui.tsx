import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { type Api, type Approach, type Card, type Common, type ContactField, type Session, call } from './api'

const paths = {
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.5M17 14.5a6 6 0 0 1 4 5.5',
  inbox: 'M4 13l2-8h12l2 8v6H4v-6ZM4 13h5a3 3 0 0 0 6 0h5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  badge: 'M6 3h12v18H6zM9 8h6v6H9zM9 17h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  booth: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  pulse: 'M2 12h4l3-8 4 16 3-8h6',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  check: 'M5 12l5 5 9-10',
  link: 'M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1',
  chat: 'M4 5h16v11H9l-5 4z',
  ask: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01',
  moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 13h5M10 17h5',
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
}
export type IconName = keyof typeof paths
export const Icon = ({ name }: { name: IconName }) => <svg className="icon" viewBox="0 0 24 24" aria-hidden><path d={paths[name]} /></svg>

// Icon + words + color, so the meaning never rests on color alone.
export const approaches: Record<Approach, { icon: IconName; label: string; hint: string }> = {
  open: { icon: 'chat', label: 'Open to chat', hint: 'Come say hi any time.' },
  ask: { icon: 'ask', label: 'Ask first', hint: 'Check in before you start a conversation.' },
  quiet: { icon: 'moon', label: 'Quiet mode', hint: 'A wave or a note is best.' },
}
export const ApproachPill = ({ approach }: { approach: Approach }) => (
  <span className="pill" data-approach={approach}><Icon name={approaches[approach].icon} />{approaches[approach].label}</span>
)

export const fieldNames: Record<ContactField, string> = { email: 'Email', linkedin: 'LinkedIn', github: 'GitHub' }
export const listOf = (xs: string[]) => new Intl.ListFormat('en').format(xs)
export const nameOf = (c: Card) => c.name ?? 'A visitor'
export const pct = (n: number) => `${Math.round(n * 100)}%`
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}
const still = () => document.documentElement.dataset.motion === 'reduce'

/** A number that rolls to its new value (and simply changes under reduced motion). */
export function Counter({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(still() ? value : 0)
  const from = useRef(shown)
  useEffect(() => {
    if (still()) return setShown(value)
    const a = from.current, t0 = performance.now()
    let raf = requestAnimationFrame(function step() {
      const k = Math.min(1, (performance.now() - t0) / 700)
      setShown((from.current = a + (value - a) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    })
    // A hidden tab pauses frames; the timer makes sure the number still lands on the truth.
    const land = setTimeout(() => setShown((from.current = value)), 750)
    return () => { cancelAnimationFrame(raf); clearTimeout(land) }
  }, [value])
  return <span className="num">{format(Math.round(shown))}</span>
}

/** Things in common: the count ticks up, chips pop in one by one, and a related pair is drawn as two tags joined by a link. */
export function CommonList({ items, them }: { items: Common[]; them: string }) {
  if (!items.length) return <p className="dim">Nothing in common on paper. Say hi anyway.</p>
  return (
    <section className="common">
      <h3><Counter value={items.length} /> {items.length === 1 ? 'thing' : 'things'} in common</h3>
      <ul>
        {items.map((c, i) => (
          <li key={c.mine + c.theirs} data-kind={c.kind} style={{ '--i': i } as CSSProperties}>
            {c.kind === 'same' ? <span className="chip"><Icon name="check" />{c.mine}<small>both of you</small></span> : (
              <>
                <span className="chip">{c.mine}<small>you</small></span>
                <span className="join"><Icon name="link" />related</span>
                <span className="chip">{c.theirs}<small>{them}</small></span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

type LiveKey = 'GET /api/people' | 'GET /api/inbox' | 'GET /api/booth' | 'GET /api/pulse'
/** Loads a list and refreshes it every 2 seconds while the page is visible, so the other phone's actions show up here. */
export function useLive<K extends LiveKey>(session: Session, key: K) {
  const [data, setData] = useState<Api[K]['res']>()
  const [error, setError] = useState<string>()
  const load = useCallback(
    () => (call as (s: Session, k: LiveKey) => Promise<Api[K]['res']>)(session, key).then(
      (next) => { setError(undefined); setData((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next)) },
      (e: Error) => setError(e.message),
    ),
    [session, key],
  )
  useEffect(() => {
    void load()
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 2000)
    return () => clearInterval(t)
  }, [load])
  return [data, load, error] as const
}

export const Loading = ({ error }: { error?: string }) => (error ? <p role="alert" className="card">{error}</p> : <p className="dim" role="status">Loading…</p>)

/** Downscale a selfie in the browser so only a small JPEG ever leaves the phone. */
export async function resizePhoto(file: Blob, max = 320) {
  const img = await createImageBitmap(file), s = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * s), height: Math.round(img.height * s) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}
