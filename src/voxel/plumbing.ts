import { springCells } from '../game/blueprints/agora'
import { Block, isFlowing } from './blocks'

/**
 * Running water for the agora's fountain (Phase 14). A lion's-head spout runs while terracotta
 * pipe sections, each touching the next face to face, join it to the spring on the ridge. Plain
 * functions over block ids, with no randomness or timing, so the game and a room server always
 * agree; VoxelWorld runs them whenever a pipe, a spout or the spring changes.
 */
type Get = (x: number, y: number, z: number) => number
type Cell = readonly [number, number, number]

const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const
/** The sides a spout pours from, in the order it tries them. */
const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
/** Pipe sections followed from the spring at most, so a vast network cannot stall a frame. */
const MOST = 8192

const key = (x: number, y: number, z: number) => `${x},${y},${z}`
const springs = new Set(springCells.map(([x, y, z]) => key(x, y, z)))
export const isSpring = (x: number, y: number, z: number) => springs.has(key(x, y, z))

/** The cell a spout pours into: its first open side (air or water). Null when it is walled in. */
export function spoutOutput(get: Get, x: number, y: number, z: number): Cell | null {
  for (const [dx, dz] of SIDES) {
    const id = get(x + dx, y, z + dz)
    if (id === Block.air || id === Block.water || isFlowing(id)) return [x + dx, y, z + dz]
  }
  return null
}

/** Every pipe section joined to a spring that holds water, as cell keys. */
export function fedPipes(get: Get) {
  const reached = new Set<string>()
  const queue: Cell[] = springCells.filter(([x, y, z]) => get(x, y, z) === Block.water)
  while (queue.length && reached.size < MOST) {
    const [x, y, z] = queue.shift()!
    for (const [dx, dy, dz] of FACES) {
      const nx = x + dx, ny = y + dy, nz = z + dz
      const k = key(nx, ny, nz)
      if (reached.has(k) || get(nx, ny, nz) !== Block.pipe) continue
      reached.add(k)
      queue.push([nx, ny, nz])
    }
  }
  return reached
}

/** True when a spout touches a fed pipe section, or the spring itself. */
export function spoutRuns(get: Get, fed: ReadonlySet<string>, x: number, y: number, z: number) {
  return FACES.some(([dx, dy, dz]) => {
    const k = key(x + dx, y + dy, z + dz)
    return fed.has(k) || (springs.has(k) && get(x + dx, y + dy, z + dz) === Block.water)
  })
}
