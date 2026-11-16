import { islandEdge } from '../game/terrain'
import { isSolid, Block } from '../voxel/blocks'
import type { Stack } from '../game/items'
import type { Sampler } from '../voxel/mesher'
import { S, bx, by, bz, wy } from '../voxel/grid'

export type AnimalKind = 'sheep' | 'goat' | 'chicken'

export interface Animal {
  id: number
  kind: AnimalKind
  x: number
  y: number
  z: number
  /** Facing angle around y; 0 looks towards +z. */
  yaw: number
  tx: number
  tz: number
  walking: boolean
  /** Seconds until the next decision while standing. */
  timer: number
  vy: number
  /** Seconds until a sheared sheep's wool grows back (0 = woolly). */
  sheared: number
  /** Seconds before a goat gives milk or a chicken drops a feather when touched again. */
  cooldown: number
  /** Seconds of running away after being hit. */
  flee: number
  /** Short hop when hit. */
  hurt: number
  /** Seconds until a chicken drops a feather on its own. */
  lay: number
  /** Walk cycle for the legs. */
  stride: number
}

export const specs: Record<AnimalKind, { speed: number; height: number; radius: number; count: number }> = {
  sheep: { speed: 0.8, height: 0.95, radius: 0.42, count: 6 },
  goat: { speed: 1.05, height: 1.0, radius: 0.38, count: 4 },
  chicken: { speed: 0.75, height: 0.55, radius: 0.2, count: 6 },
}

/** Herd meadows, away from the theatre and the paths. */
const meadows: Record<AnimalKind, [number, number]> = {
  sheep: [-14, 12],
  goat: [15, -10],
  chicken: [12, 14],
}

function random(seed: number) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/** Top of the highest solid block at or below a small step above `fromY` (trees overhead are ignored). */
export function groundBelow(world: Sampler, x: number, z: number, fromY: number) {
  const ix = bx(x), iz = bz(z)
  for (let y = by(fromY + S + 0.01); y >= 0; y--) if (isSolid(world.get(ix, y, iz))) return wy(y + 1)
  return -10
}

function clearAt(world: Sampler, x: number, y: number, z: number, height: number, radius: number) {
  const r = radius * 0.7
  for (const [dx, dz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
    for (let iy = by(y + 0.01); iy <= by(y + height); iy++) {
      if (isSolid(world.get(bx(x + dx), iy, bz(z + dz)))) return false
    }
  }
  return true
}

const onIsland = (x: number, z: number) => Math.hypot(x, z) < islandEdge(Math.atan2(x, -z)) - 3

/** Whether an animal standing at height `y` may step to (x, z): one block up, a short drop down, no walls. */
export function canStep(world: Sampler, animal: Pick<Animal, 'kind' | 'y'>, x: number, z: number) {
  if (!onIsland(x, z)) return false
  const ground = groundBelow(world, x, z, animal.y)
  if (ground < -0.4) return false
  if (ground - animal.y > S + 0.01 || animal.y - ground > 1.6) return false
  const { height, radius } = specs[animal.kind]
  return clearAt(world, x, ground, z, height, radius)
}

function create(id: number, kind: AnimalKind, x: number, y: number, z: number, rng: () => number): Animal {
  return {
    id, kind, x, y, z, yaw: rng() * Math.PI * 2, tx: x, tz: z, walking: false,
    timer: 1 + rng() * 4, vy: 0, sheared: 0, cooldown: 0, flee: 0, hurt: 0, lay: 40 + rng() * 60, stride: 0,
  }
}

/** Places each herd on open grass around its meadow. The same seed gives the same animals, with the same ids. */
export function spawnAnimals(world: Sampler, seed = 7) {
  const rng = random(seed)
  const list: Animal[] = []
  for (const kind of Object.keys(specs) as AnimalKind[]) {
    const [cx, cz] = meadows[kind]
    let placed = 0
    for (let tries = 0; tries < 400 && placed < specs[kind].count; tries++) {
      const angle = rng() * Math.PI * 2, distance = 0.5 + rng() * 5
      const x = cx + Math.cos(angle) * distance, z = cz + Math.sin(angle) * distance
      const y = groundBelow(world, x, z, 20)
      if (world.get(bx(x), by(y - 0.01), bz(z)) !== Block.grass) continue
      if (list.some((other) => Math.hypot(other.x - x, other.z - z) < 1.1)) continue
      const animal = create(list.length + 1, kind, x, y, z, rng)
      if (!canStep(world, animal, x, z)) continue
      list.push(animal)
      placed++
    }
  }
  return list
}

export interface Context {
  world: Sampler
  night: boolean
  rng?: () => number
}

/** Moves one animal for one frame. Returns 'feather' when a chicken drops one on its own. */
export function updateAnimal(animal: Animal, dt: number, { world, night, rng = Math.random }: Context) {
  let event: 'feather' | null = null
  animal.cooldown = Math.max(0, animal.cooldown - dt)
  animal.flee = Math.max(0, animal.flee - dt)
  animal.hurt = Math.max(0, animal.hurt - dt)
  if (animal.sheared > 0) animal.sheared = Math.max(0, animal.sheared - dt)
  if (animal.kind === 'chicken' && !night) {
    animal.lay -= dt
    if (animal.lay <= 0) { animal.lay = 50 + rng() * 70; event = 'feather' }
  }

  // Animals settle down at night unless something startles them.
  const resting = night && animal.flee <= 0
  if (animal.walking && !resting) {
    const dx = animal.tx - animal.x, dz = animal.tz - animal.z
    const distance = Math.hypot(dx, dz)
    const step = specs[animal.kind].speed * (animal.flee > 0 ? 2.3 : 1) * dt
    if (distance < 0.15) {
      animal.walking = false
      animal.timer = 2 + rng() * 5
    } else {
      const nx = animal.x + (dx / distance) * Math.min(step, distance)
      const nz = animal.z + (dz / distance) * Math.min(step, distance)
      if (canStep(world, animal, nx, nz)) {
        animal.x = nx
        animal.z = nz
        animal.stride += step * 9
        const facing = Math.atan2(dx, dz)
        const turn = Math.atan2(Math.sin(facing - animal.yaw), Math.cos(facing - animal.yaw))
        animal.yaw += turn * Math.min(1, dt * 6)
      } else {
        animal.walking = false
        animal.timer = 0.5 + rng() * 2
      }
    }
  } else if (!resting) {
    animal.timer -= dt
    if (animal.timer <= 0) {
      const angle = rng() * Math.PI * 2, distance = 1.5 + rng() * 4.5
      const tx = animal.x + Math.cos(angle) * distance, tz = animal.z + Math.sin(angle) * distance
      // Keep clear of the building site so herds do not stand in the blueprint.
      if (Math.hypot(tx, tz) > 10 && onIsland(tx, tz)) {
        animal.tx = tx
        animal.tz = tz
        animal.walking = true
      } else {
        animal.timer = 0.5
      }
    }
  }
  if (!animal.walking) animal.stride *= 1 - Math.min(1, dt * 8)

  // Follow the ground: fall when it drops away, hop up single blocks.
  const ground = groundBelow(world, animal.x, animal.z, animal.y)
  if (animal.y > ground + 0.01) {
    animal.vy -= 18 * dt
    animal.y = Math.max(ground, animal.y + animal.vy * dt)
    if (animal.y === ground) animal.vy = 0
  } else if (animal.y < ground) {
    animal.y = Math.min(ground, animal.y + dt * 4)
    animal.vy = 0
  }
  return event
}

/** Runs away from (px, pz) after being hit. */
export function startle(animal: Animal, px: number, pz: number) {
  const dx = animal.x - px, dz = animal.z - pz
  const distance = Math.hypot(dx, dz) || 1
  animal.tx = animal.x + (dx / distance) * 5
  animal.tz = animal.z + (dz / distance) * 5
  animal.walking = true
  animal.flee = 2.4
  animal.hurt = 0.35
}

/** Nearest animal hit by a ray, using an upright box around each one. */
export function pickAnimal(list: readonly Animal[], origin: readonly number[], direction: readonly number[], reach: number) {
  let best: { animal: Animal; distance: number } | null = null
  for (const animal of list) {
    const { radius, height } = specs[animal.kind]
    const min = [animal.x - radius, animal.y, animal.z - radius]
    const max = [animal.x + radius, animal.y + height, animal.z + radius]
    let near = 0, far = reach
    let hit = true
    for (let axis = 0; axis < 3; axis++) {
      const d = direction[axis], o = origin[axis]
      if (Math.abs(d) < 1e-9) {
        if (o < min[axis] || o > max[axis]) { hit = false; break }
        continue
      }
      let t1 = (min[axis] - o) / d, t2 = (max[axis] - o) / d
      if (t1 > t2) [t1, t2] = [t2, t1]
      near = Math.max(near, t1)
      far = Math.min(far, t2)
      if (near > far) { hit = false; break }
    }
    if (hit && (!best || near < best.distance)) best = { animal, distance: near }
  }
  return best
}

/**
 * One step of a whole herd. Plain code with no rendering, so the room server runs the animals for
 * everyone (Phase 12). `feather` is called where a chicken drops one on its own.
 */
export function stepAnimals(list: Animal[], dt: number, context: Context, feather: (x: number, y: number, z: number) => void) {
  for (const animal of list) {
    if (updateAnimal(animal, dt, context) === 'feather') feather(animal.x, animal.y + 0.3, animal.z)
  }
}

/** Hit from (px, pz): the animal runs off; a woolly sheep gives wool, a chicken a feather now and then. */
export function strikeGives(animal: Animal, px: number, pz: number, random = Math.random): Stack | null {
  startle(animal, px, pz)
  if (animal.kind === 'sheep' && animal.sheared <= 0) {
    animal.sheared = 120
    return { item: 'wool', count: 1 + Math.round(random()) }
  }
  if (animal.kind === 'chicken' && animal.cooldown <= 0) {
    animal.cooldown = 10
    return { item: 'feather', count: 1 }
  }
  return null
}

/** Tended: the animal stops for a moment, and a goat gives milk every half minute. */
export function tendGives(animal: Animal): Stack | null {
  animal.walking = false
  animal.timer = 2
  if (animal.kind !== 'goat' || animal.cooldown > 0) return null
  animal.cooldown = 30
  return { item: 'milk', count: 1 }
}
