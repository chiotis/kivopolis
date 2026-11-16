import { Block, isFlowing, isSolid, isWater } from './blocks'
import { SEA_Y } from './grid'

/**
 * Flowing water rules. Plain functions over block ids, with no randomness and no timing, so the
 * same edits always give the same water: the game runs them now, and a room server can later.
 *
 * A source (`Block.water`) has strength 8. Water falling from above has strength 7. Water on solid
 * ground spreads sideways, losing one level per block, so it reaches 7 blocks from a source.
 * At or below sea level, any opening that water reaches fills completely, as the sea does.
 */
export const SOURCE = 8

export const strength = (id: number) => id === Block.water ? SOURCE : isFlowing(id) ? id - Block.flow1 + 1 : 0
export const waterBlock = (level: number) => level >= SOURCE ? Block.water : level <= 0 ? Block.air : Block.flow1 + level - 1

type Get = (x: number, y: number, z: number) => number
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** Water only runs sideways out of a cell that rests on solid ground; otherwise it falls. */
const spreads = (get: Get, x: number, y: number, z: number) => isSolid(get(x, y - 1, z))

/** The block a cell should hold after the next tick, judged from its neighbours. */
export function nextWater(get: Get, x: number, y: number, z: number): number {
  const id = get(x, y, z)
  // Sources stay until a player takes them, and water never washes away a block.
  if (id !== Block.air && !isFlowing(id)) return id
  const above = isWater(get(x, y + 1, z))
  if (y <= SEA_Y && (above || SIDES.some(([dx, dz]) => isWater(get(x + dx, y, z + dz))))) return Block.water
  let level = above ? SOURCE - 1 : 0
  for (const [dx, dz] of SIDES) {
    const side = strength(get(x + dx, y, z + dz))
    if (side > level + 1 && spreads(get, x + dx, y, z + dz)) level = side - 1
  }
  return waterBlock(level)
}

/** Height of the water surface inside its cell, 0–1. Sources sit half a block down, like the sea. */
export function surfaceHeight(get: Get, x: number, y: number, z: number) {
  const id = get(x, y, z)
  if (!isWater(id)) return 0
  if (isWater(get(x, y + 1, z))) return 1
  return 0.1 + 0.4 * (strength(id) - 1) / (SOURCE - 1)
}

/**
 * True when a point (in block units, fractional y) is under water. Sources and falling water fill
 * their whole cell; a thin flow only up to its surface, so a puddle is not deep enough to swim in.
 */
export function submerged(get: Get, x: number, y: number, z: number) {
  const cy = Math.floor(y)
  const id = get(x, cy, z)
  if (!isWater(id)) return false
  if (id === Block.water || isWater(get(x, cy + 1, z))) return true
  return y - cy < surfaceHeight(get, x, cy, z)
}
