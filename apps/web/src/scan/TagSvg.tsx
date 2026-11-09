import { BIT_X, BIT_Y, CODES } from './tag36h11'

/** 10x10 cells (true = black): white quiet zone, black border, data bits where 1 = white. Mirrors apriltag_to_image(). */
export function tagGrid(id: number): boolean[][] {
  const code = CODES[id]
  if (code === undefined) throw new RangeError(`tag36h11 has no id ${id}`)
  const grid = Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => x > 0 && x < 9 && y > 0 && y < 9))
  BIT_X.forEach((x, i) => { if (Math.floor(code / 2 ** (35 - i)) % 2) grid[BIT_Y[i] + 1][x + 1] = false })
  return grid
}

export function TagSvg({ id, size = 240 }: { id: number; size?: number }) {
  const d = tagGrid(id).flatMap((row, y) => row.map((black, x) => (black ? `M${x} ${y}h1v1h-1z` : ''))).join('')
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" role="img" aria-label={`Badge ${id}`}>
      <rect width="10" height="10" fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
