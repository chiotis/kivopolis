export type Point = [number, number, number]
export type Mission = 'discover' | 'orchestra' | 'seats' | 'koilon' | 'stairs' | 'skene' | 'finish'
export interface Objective {
  id: Mission
  reward: number
}

export const objectives: Objective[] = [
  { id: 'discover', reward: 0 },
  { id: 'orchestra', reward: 100 },
  { id: 'seats', reward: 150 },
  { id: 'koilon', reward: 200 },
  { id: 'stairs', reward: 150 },
  { id: 'skene', reward: 200 },
  { id: 'finish', reward: 300 },
]

export const spawn: Point = [6.5, 0, 11]
export const siteMarker: Point = [6.4, 0, 5.8]
export const tourMarker: Point = [-6.15, 0, 3.7]
/** Seat rows of the koilon, measured from the orchestra centre. */
export const rowRadii = [5.05, 6.43, 7.81]
export const rowRise = 0.5
export const rowBase = 0.02

// Zero angle points uphill (-Z).
export function polar(radius: number, angle: number, elevation: number): Point {
  return [radius * Math.sin(angle), elevation, -radius * Math.cos(angle)]
}
