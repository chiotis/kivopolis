export type Point = [number, number, number]
export type Mission = 'discover' | 'orchestra' | 'analemmata' | 'seats' | 'diazoma' | 'koilon' | 'stairs' | 'skene' | 'finish'
export interface Objective {
  id: Mission
  reward: number
}

export const objectives: Objective[] = [
  { id: 'discover', reward: 0 },
  { id: 'orchestra', reward: 100 },
  { id: 'analemmata', reward: 150 },
  { id: 'seats', reward: 150 },
  { id: 'diazoma', reward: 100 },
  { id: 'koilon', reward: 200 },
  { id: 'stairs', reward: 150 },
  { id: 'skene', reward: 200 },
  { id: 'finish', reward: 300 },
]

export const spawn: Point = [6.5, 0, 11]
export const siteMarker: Point = [6.4, 0, 5.8]
export const tourMarker: Point = [-6.15, 0, 4.6]
/**
 * Centre line of the two side roads, the parodoi, as a distance downhill (+Z) at each x.
 * It mirrors across the theatre's axis, so both roads and their gateways line up.
 */
export const parodosZ = (x: number) => 2.4 + Math.sin(Math.abs(x) * 0.27) * 0.8
/**
 * The koilon climbs in five terraces, one block apart: two seat rows, the diazoma (a level
 * walkway that splits the lower and upper tiers), then two more seat rows.
 */
export const terraces = ['seats', 'seats', 'diazoma', 'seats', 'seats'] as const
export const DIAZOMA = terraces.indexOf('diazoma')
export const TERRACE_START = 4.38
export const TERRACE_WIDTH = 1.38
/** Outer edge of the top terrace, where the koilon meets the hillside. */
export const KOILON_EDGE = TERRACE_START + TERRACE_WIDTH * terraces.length
export const terraceOf = (radius: number) =>
  Math.min(terraces.length - 1, Math.max(0, Math.floor((radius - TERRACE_START) / TERRACE_WIDTH)))
const centreOf = (terrace: number) => TERRACE_START + TERRACE_WIDTH * (terrace + 0.5) - 0.02
/** Terrace of each seat row, from the front row outwards. */
export const rowTerraces = terraces.flatMap((kind, terrace) => kind === 'seats' ? [terrace] : [])
/** Seat rows of the koilon, measured from the orchestra centre. */
export const rowRadii = rowTerraces.map(centreOf)
export const rowRise = 0.5
export const rowBase = 0.02

/** Seats fill the bowl up to this angle either side of the axis. */
export const SEAT_EDGE = 1.27
/** The two radial stairways that split the seats into three kerkides. */
export const AISLES = [-0.44, 0.44]
export const AISLE_HALF = 0.087
export const inAisle = (angle: number) => AISLES.some((a) => Math.abs(angle - a) < AISLE_HALF)
/** The analemmata, the two retaining walls that close the koilon at its sides, run along this angle. */
export const ANALEMMA_ANGLE = 1.3

// Zero angle points uphill (-Z).
export function polar(radius: number, angle: number, elevation: number): Point {
  return [radius * Math.sin(angle), elevation, -radius * Math.cos(angle)]
}
