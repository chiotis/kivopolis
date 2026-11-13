import { isEmpty } from './blocks'
import { OX, OY, OZ, S } from './grid'
import type { Sampler } from './mesher'

export interface VoxelHit {
  x: number
  y: number
  z: number
  /** Face normal of the face the ray entered through; all zero if the ray started inside a block. */
  normal: [number, number, number]
  /** Distance in world units. */
  distance: number
}

/** Amanatides–Woo grid traversal. Origin and direction are in world units. */
export function raycast(world: Sampler, origin: [number, number, number], direction: [number, number, number], reach: number): VoxelHit | null {
  const length = Math.hypot(...direction)
  if (!length) return null
  const d = direction.map((v) => v / length) as [number, number, number]
  const p = [origin[0] / S + OX, origin[1] / S + OY, origin[2] / S + OZ]
  const cell = p.map(Math.floor)
  const step = d.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
  const tDelta = d.map((v) => (v ? Math.abs(1 / v) : Infinity))
  const tMax = d.map((v, axis) => {
    if (!v) return Infinity
    const boundary = v > 0 ? cell[axis] + 1 - p[axis] : p[axis] - cell[axis]
    return boundary / Math.abs(v)
  })
  const limit = reach / S
  const normal: [number, number, number] = [0, 0, 0]
  let t = 0
  while (t <= limit) {
    if (!isEmpty(world.get(cell[0], cell[1], cell[2]))) {
      return { x: cell[0], y: cell[1], z: cell[2], normal: [...normal], distance: t * S }
    }
    const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2)
    t = tMax[axis]
    tMax[axis] += tDelta[axis]
    cell[axis] += step[axis]
    normal[0] = normal[1] = normal[2] = 0
    normal[axis] = -step[axis]
  }
  return null
}
