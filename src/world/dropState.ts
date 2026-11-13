import type { Stack } from '../game/items'

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
}

export const MAX_DROPS = 160
export const LIFETIME = 300
let nextId = 1
export const drops: DropEntity[] = []

export function spawnDrop(stack: Stack, x: number, y: number, z: number, velocity?: [number, number, number], delay = 0.35) {
  if (stack.count <= 0) return
  if (drops.length >= MAX_DROPS) drops.shift()
  const [vx, vy, vz] = velocity ?? [(Math.random() - 0.5) * 1.6, 2.2 + Math.random(), (Math.random() - 0.5) * 1.6]
  drops.push({ id: nextId++, stack: { ...stack }, x, y, z, vx, vy, vz, age: 0, delay })
}

export function clearDrops() { drops.length = 0 }
