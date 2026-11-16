import type { Stack } from '../game/items'
import { bx, by, bz, wy } from '../voxel/grid'

/** A stack lying in the world, waiting to be picked up. */
export interface DropEntity {
  id: number
  stack: Stack
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  /** Seconds before the player can pick it up (longer for items the player threw). */
  delay: number
  /** In a room: when this player last asked the room for it, so it is not asked for every frame. */
  asked?: number
}

export const MAX_DROPS = 160
export const LIFETIME = 300
let nextId = 1
export const drops: DropEntity[] = []

/**
 * In a room (Phase 12) the room server owns the dropped items: a new one is sent there instead of
 * being added here, and comes back to everyone with the room's id.
 */
export const dropNetwork: { spawn: ((stack: Stack, from: [number, number, number], velocity: [number, number, number], delay: number) => void) | null } = { spawn: null }

export const randomVelocity = (random = Math.random): [number, number, number] =>
  [(random() - 0.5) * 1.6, 2.2 + random(), (random() - 0.5) * 1.6]

export function spawnDrop(stack: Stack, x: number, y: number, z: number, velocity?: [number, number, number], delay = 0.35) {
  if (stack.count <= 0) return
  const v = velocity ?? randomVelocity()
  if (dropNetwork.spawn) { dropNetwork.spawn({ ...stack }, [x, y, z], v, delay); return }
  addDrop(drops, { id: nextId++, stack: { ...stack }, x, y, z, vx: v[0], vy: v[1], vz: v[2], age: 0, delay })
}

/** Adds a drop to a list, letting the oldest go when there are too many. Returns the one let go. */
export function addDrop(list: DropEntity[], drop: DropEntity) {
  const gone = list.length >= MAX_DROPS ? list.shift() : undefined
  list.push(drop)
  return gone
}

export function clearDrops() { drops.length = 0 }

/** Replaces this game's drops with the room's (Phase 12). */
export function setDrops(list: DropEntity[]) {
  drops.length = 0
  for (const drop of list) drops.push({ ...drop, stack: { ...drop.stack } })
}

/**
 * Moves one drop for one frame: it falls, bounces off walls and settles on the ground. Plain code,
 * so the game and the room server move drops the same way. Returns false once it should be removed.
 */
export function stepDrop(drop: DropEntity, dt: number, world: { solidAt(x: number, y: number, z: number): boolean }) {
  drop.age += dt
  drop.vy = Math.max(-20, drop.vy - 18 * dt)
  const nx = drop.x + drop.vx * dt, nz = drop.z + drop.vz * dt
  if (!world.solidAt(bx(nx), by(drop.y + 0.02), bz(drop.z))) drop.x = nx; else drop.vx *= -0.3
  if (!world.solidAt(bx(drop.x), by(drop.y + 0.02), bz(nz))) drop.z = nz; else drop.vz *= -0.3
  const ny = drop.y + drop.vy * dt
  if (world.solidAt(bx(drop.x), by(ny), bz(drop.z))) {
    drop.y = wy(by(ny) + 1)
    drop.vy = 0
    drop.vx *= 0.8
    drop.vz *= 0.8
  } else {
    drop.y = ny
  }
  // Items embedded in a newly placed block pop up on top of it.
  if (world.solidAt(bx(drop.x), by(drop.y + 0.01), bz(drop.z))) drop.y = wy(by(drop.y + 0.01) + 1)
  return drop.stack.count > 0 && drop.age <= LIFETIME && drop.y >= -8
}
