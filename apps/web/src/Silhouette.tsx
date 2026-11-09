import { type CSSProperties, useEffect, useId, useRef, useState } from 'react'
import { param } from './api'

const aurora = ['#8b6cff', '#c56cf0', '#ff6f7d', '#ff8f5c', '#ffb454', '#6f7dff']
export const patterns = ['rings', 'dots', 'lines', 'waves', 'grid'] as const

/** Everything that makes one silhouette different from another, derived only from the id. The figure itself never changes. */
export function silhouetteSpec(id: string) {
  let h = 2166136261
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  const a = h % 6
  return { from: aurora[a], to: aurora[(a + 1 + ((h >>> 3) % 4)) % 6], angle: (h >>> 6) % 360, pattern: patterns[(h >>> 15) % 5], shift: (h >>> 19) % 12 }
}

const marks: Record<(typeof patterns)[number], (s: number) => React.ReactNode> = {
  rings: (s) => [14, 26, 38, 50].map((r) => <circle key={r} cx={30 + s * 3} cy="52" r={r} />),
  dots: (s) => Array.from({ length: 49 }, (_, i) => <circle key={i} cx={8 + (i % 7) * 14 + ((i / 7) & 1) * 7} cy={12 + Math.floor(i / 7) * 14 + s} r="2.2" fill="#fff" stroke="none" />),
  lines: (s) => Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${-20 + i * 16 + s} 110L${30 + i * 16 + s} 0`} />),
  waves: (s) => Array.from({ length: 7 }, (_, i) => <path key={i} d={`M0 ${18 + i * 13 + s}q25 -12 50 0t50 0`} />),
  grid: (s) => Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${6 + i * 13 + s} 0v100M0 ${6 + i * 13 + s}h100`} />),
}

/** A neutral figure (one head, one pair of shoulders, the same for everyone) lit by a gradient and pattern unique to the id. */
export function Silhouette({ id }: { id: string }) {
  const { from, to, angle, pattern, shift } = silhouetteSpec(id)
  const u = useId()
  return (
    <svg className="sil" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={`${u}g`} gradientTransform={`rotate(${angle} .5 .5)`}><stop stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient>
        <radialGradient id={`${u}h`} cy=".42"><stop stopColor={from} stopOpacity=".34" /><stop offset="1" stopColor={to} stopOpacity="0" /></radialGradient>
        <clipPath id={`${u}c`}><circle cx="50" cy="39" r="17" /><path d="M11 101c1-25 17-37 39-37s38 12 39 37z" /></clipPath>
      </defs>
      <rect width="100" height="100" fill="#0d0b18" />
      <rect width="100" height="100" fill={`url(#${u}h)`} />
      <g clipPath={`url(#${u}c)`}>
        <rect width="100" height="100" fill={`url(#${u}g)`} />
        <g fill="none" stroke="#fff" strokeWidth="1.2" opacity=".3">{marks[pattern](shift)}</g>
      </g>
    </svg>
  )
}

const REVEAL_MS = 1500

/**
 * A silhouette that fills in with the photo when `photo` arrives (the reveal) and drains back when it leaves.
 * `?reveal=0.5` freezes the reveal part-way, for screenshots.
 */
export function Portrait({ id, photo, label }: { id: string; photo?: string; label: string }) {
  const freeze = param('reveal')
  const [shown, setShown] = useState(photo)
  const [phase, setPhase] = useState<'in' | 'out' | undefined>(freeze && photo ? 'in' : undefined)
  const prev = useRef(photo)
  useEffect(() => {
    if (!photo === !prev.current) return
    prev.current = photo
    if (photo) setShown(photo)
    setPhase(photo ? 'in' : 'out')
    const t = setTimeout(() => { setPhase(undefined); if (!photo) setShown(undefined) }, REVEAL_MS)
    return () => clearTimeout(t)
  }, [photo])
  return (
    <span className="portrait" role="img" aria-label={label} data-phase={phase} data-freeze={freeze && phase ? '' : undefined} style={{ '--at': freeze ?? 0 } as CSSProperties}>
      <span className="frame">
        <Silhouette id={id} />
        {shown && <span className="photo"><img src={shown} alt="" /></span>}
        <i className="beam" />
      </span>
      <i className="bloom" />
    </span>
  )
}
