/**
 * The KivoPolis mark: four isometric block columns, worn down from back to front. The back one
 * stands whole (base, shaft, capital), the others are broken lower and lower, down to a lone base. Pure geometry, so the same
 * drawing feeds the title screen and the favicon.
 */

/** True isometric projection: both ground axes at 30° to the horizontal, every edge the same length. */
const L = 4
const COS = Math.cos(Math.PI / 6)
const point = (x: number, y: number, z: number) => [(x - y) * L * COS, (x + y) * L / 2 - z * L] as const

type Face = 'top' | 'left' | 'right'
export interface Polygon { face: Face; points: string }

/** The three visible faces of a box, back to front so later boxes cover earlier ones. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Polygon[] {
  const corners = (list: [number, number, number][]) => list.map(([x, y, z]) => point(x, y, z).map((v) => +v.toFixed(2)).join(',')).join(' ')
  return [
    { face: 'right', points: corners([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]) },
    { face: 'left', points: corners([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]) },
    { face: 'top', points: corners([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) },
  ]
}

/** A column on block (i, j): a full-size base, a slimmer shaft and, when whole, a capital. */
function column(i: number, j: number, shaft: number, capital: boolean) {
  const inset = 0.17
  const parts = box(i, i + 1, j, j + 1, 0, 1)
  for (let k = 1; k <= shaft; k++) parts.push(...box(i + inset, i + 1 - inset, j + inset, j + 1 - inset, k, k + 1))
  if (capital) parts.push(...box(i, i + 1, j, j + 1, shaft + 1, shaft + 1.6))
  return parts
}

// On a shared stone platform, the whole column stands at the back, a three-block stump on the
// left, a two-block stump on the right and a lone base in front. Drawn back to front.
const GAP = 2.3
export const logoPolygons: Polygon[] = [
  ...box(-0.35, GAP + 1.35, -0.35, GAP + 1.35, -0.4, 0),
  ...column(0, 0, 4, true),
  ...column(0, GAP, 3, false),
  ...column(GAP, 0, 2, false),
  ...column(GAP, GAP, 0, false),
]

const xs = logoPolygons.flatMap((p) => p.points.split(' ').map((pair) => +pair.split(',')[0]))
const ys = logoPolygons.flatMap((p) => p.points.split(' ').map((pair) => +pair.split(',')[1]))
const pad = 1
export const logoViewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2]
  .map((v) => +v.toFixed(2)).join(' ')

export const logoColors: Record<Face, string> = { top: '#fff3dc', left: '#efcf95', right: '#c3925a' }
