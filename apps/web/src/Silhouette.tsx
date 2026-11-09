// Flat conference-badge silhouettes: the same neutral bust for everyone (one head, one pair of shoulders, no hair, skin or body cues),
// told apart by a square/bust colour pair and a subtle pattern, all derived from the person's id.
// Navy, violet and teal only: nothing that could read as a skin tone.
const stocks = [['#113E82', '#9DB7F0'], ['#5B2D8E', '#C9A9F2'], ['#1F8A84', '#C8F3EE'], ['#0B2A5E', '#93EAFF'], ['#6A37A3', '#E0CCFA'], ['#17625E', '#9DB7F0']]
const patterns = [
  '<circle cx="5" cy="5" r="1.600"/>', '<path d="M0 10L10 0" stroke-width="1.800"/>', '<path d="M0 5h10" stroke-width="1.600"/>',
  '<path d="M5 2v6M2 5h6" stroke-width="1.400"/>', '<path d="M0 6q2.500-5 5 0t5 0" stroke-width="1.400" fill="none"/>', '<rect x="3" y="3" width="4" height="4"/>',
]

export function hash(id: string) {
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Pure and deterministic, so the same person looks the same on every phone. */
export function silhouetteSvg(id: string) {
  const h = hash(id), [stock, ink] = stocks[h % stocks.length]
  const pattern = patterns[(h >>> 4) % patterns.length], tilt = ((h >>> 8) % 13) - 6, u = `s${h}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><pattern id="${u}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(${tilt * 5})"><g fill="${ink}" stroke="${ink}" opacity=".14">${pattern}</g></pattern></defs><rect width="80" height="80" fill="${stock}"/><rect width="80" height="80" fill="url(#${u})"/><path d="M10 82a30 30 0 0 1 60 0z" fill="${ink}"/><circle cx="40" cy="30" r="13.500" fill="${ink}"/></svg>`
}

export const silhouetteUrl = (id: string) => `data:image/svg+xml,${encodeURIComponent(silhouetteSvg(id))}`

export function Silhouette({ id, label = 'Silhouette', className = '' }: { id: string; label?: string; className?: string }) {
  return <img className={`sil ${className}`} src={silhouetteUrl(id)} alt={label} />
}
