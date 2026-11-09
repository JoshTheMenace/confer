import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Card } from './api'

/** FNV-1a: a stable number from any string, so the same person or tag always looks the same. */
export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Flat block colour and the figure colour that reads on it.
const blocks = [['#ff4b1f', '#111'], ['#2b4bff', '#f6f1e7'], ['#ffd21f', '#111'], ['#00b67a', '#111'], ['#ff8fc7', '#111'], ['#8a5cff', '#f6f1e7']]
// Neutral by construction: abstract shapes only, no hair, clothing, body or skin cues.
const heads = ['<circle cx="50" cy="38" r="17"/>', '<rect x="34" y="22" width="32" height="32"/>', '<path d="M50 18 70 38 50 58 30 38z"/>', '<path d="M40 21h20l10 17-10 17H40L30 38z"/>']
const bodies = ['<circle cx="50" cy="104" r="38"/>', '<path d="M22 100l10-34h36l10 34z"/>', '<rect x="20" y="66" width="60" height="40" rx="14"/>', '<path d="M50 62 88 100H12z"/>']
const accents = ['<circle cx="100" cy="0" r="30"/>', '<path d="M0 0h26v26H0z"/>', '<path d="M0 78 22 100H0z"/><path d="M78 0h22v22z"/>', '<circle cx="14" cy="14" r="5"/><circle cx="30" cy="14" r="5"/><circle cx="14" cy="30" r="5"/>']

export function silhouetteSpec(id: string) {
  const h = hash(id)
  return { block: h % 6, head: (h >>> 3) % 4, body: (h >>> 5) % 4, accent: (h >>> 7) % 4 }
}

/** The silhouette as a standalone SVG data URL: one source for the tile, the album and the reveal's tiles. */
export function silhouetteUrl(id: string) {
  const s = silhouetteSpec(id), [bg, fg] = blocks[s.block]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><g fill="${fg}" opacity=".28">${accents[s.accent]}</g><g fill="${fg}">${heads[s.head]}${bodies[s.body]}</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const tiles = Array.from({ length: 16 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4) }))
const sparks = Array.from({ length: 8 }, (_, i) => i)

/**
 * A person as the viewer may see them: a silhouette until they share, then their photo.
 * When the photo arrives (or leaves) while mounted, the reveal plays: 16 silhouette tiles flip away on the diagonal.
 * `freeze` (0 to 1) holds the reveal part-way for screenshots.
 */
export function Portrait({ card, freeze }: { card: Pick<Card, 'id' | 'name' | 'theyShared'>; freeze?: number }) {
  const photo = card.theyShared?.photo, sil = silhouetteUrl(card.id)
  const last = useRef(photo), kept = useRef(photo)
  if (photo) kept.current = photo // the drain still needs the photo after the server has dropped it
  const [phase, setPhase] = useState<'still' | 'reveal' | 'drain'>(freeze !== undefined && photo ? 'reveal' : 'still')
  useEffect(() => {
    if (!!photo === !!last.current) return
    last.current = photo
    setPhase(photo ? 'reveal' : 'drain')
  }, [photo])
  const moving = phase !== 'still' && kept.current
  return (
    <span className={`portrait ${phase}${freeze !== undefined ? ' frozen' : ''}`} style={{ '--t': `${(freeze ?? 0) * 1.1}s` } as CSSProperties} onAnimationEnd={(e) => e.animationName === 'reveal-done' && setPhase('still')}>
      <img src={moving ? kept.current : (photo ?? sil)} alt={photo ? `${card.name ?? 'Their'} photo` : `Silhouette of ${card.name ?? 'someone you met'}`} />
      {moving && (
        <span className="tiles" aria-hidden="true">
          {tiles.map(({ x, y }) => (
            <i key={`${x}${y}`} style={{ backgroundImage: `url("${sil}")`, backgroundPosition: `${x * 33.334}% ${y * 33.334}%`, '--d': `${(x + y) * 0.06}s` } as CSSProperties} />
          ))}
          <b className="ring" />
          {phase === 'reveal' && sparks.map((i) => <u key={i} style={{ '--a': `${i * 45 + 20}deg` } as CSSProperties} />)}
        </span>
      )}
      {photo && phase !== 'drain' && <em className="stamp" aria-hidden="true">Shared with you</em>}
    </span>
  )
}
