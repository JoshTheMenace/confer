// Cut-paper silhouettes: the same neutral bust for everyone (no hair, skin or body cues),
// told apart by paper stock, cut colour, pattern and tilt, all derived from the person's id.
const stocks = [['#ffd166', '#7a4b00'], ['#9bdeac', '#14532d'], ['#a0c4ff', '#1e3a8a'], ['#ffb4a2', '#7f1d1d'], ['#d7c0f5', '#4c1d95'], ['#f5e6a8', '#365314'], ['#9be0e0', '#134e4a'], ['#f9c6dd', '#831843']]
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
  const pattern = patterns[(h >>> 4) % patterns.length], tilt = ((h >>> 8) % 13) - 6, head = 8 + ((h >>> 12) % 4) * 3, u = `s${h}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><pattern id="${u}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(${tilt * 5})"><g fill="${ink}" stroke="${ink}" opacity=".16">${pattern}</g></pattern></defs><rect width="80" height="80" fill="${stock}"/><rect width="80" height="80" fill="url(#${u})"/><g transform="rotate(${tilt} 40 60)"><path d="M11 82a29 25 0 0 1 58 0z" fill="#000" opacity=".18" transform="translate(1.500 2)"/><rect x="26.500" y="23.500" width="30" height="30" rx="${head}" fill="#000" opacity=".18"/><path d="M11 82a29 25 0 0 1 58 0z" fill="${ink}"/><rect x="25" y="22" width="30" height="30" rx="${head}" fill="${ink}"/></g></svg>`
}

export const silhouetteUrl = (id: string) => `data:image/svg+xml,${encodeURIComponent(silhouetteSvg(id))}`

export function Silhouette({ id, label = 'Silhouette', className = '' }: { id: string; label?: string; className?: string }) {
  return <img className={`sil ${className}`} src={silhouetteUrl(id)} alt={label} />
}
