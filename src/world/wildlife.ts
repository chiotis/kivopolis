import { islandEdge } from '../game/terrain'
import { AREAS } from '../game/regions'
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
  /** Seconds the animal has wanted to move and could not (missing in animals from older rooms). */
  stuck?: number
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

/**
 * How far inside a building area a point lies: below 1 inside, measured from the area's centre.
 * Areas are a little larger than their level ground, so herds keep clear of the walls too.
 */
export function insideBuilding(x: number, z: number) {
  let depth = Infinity
  for (const item of AREAS) depth = Math.min(depth, Math.hypot((x - item.x) / (item.rx + 1), (z - item.z) / (item.rz + 1)))
  return depth
}

/** Blocks that players build with: animals never climb onto them, so they cannot end up on a wall or a roof. */
const BUILT = new Set<number>([
  Block.marble, Block.terracotta, Block.ashlar, Block.planks, Block.workshop, Block.kiln, Block.lamp, Block.wool,
  Block.columnDrum, Block.capital, Block.triglyph, Block.metope, Block.statueBase, Block.bronze,
  Block.lionSpout, Block.pipe, Block.pithos, Block.amphora, Block.stall, Block.balbis, Block.voussoir,
])

/** After this long without getting anywhere, an animal jumps down from wherever it stands. */
export const STUCK_JUMP = 4
/** After this long, it gives up and is found back in its meadow. */
export const STUCK_HOME = 20

/**
 * Whether an animal standing at (from, y) may step to (x, z): one block up, a short drop down, no
 * walls, never onto a built block, and never further into a building area (an animal inside one
 * may only walk out). A stuck or frightened animal jumps down from any height.
 */
export function canStep(world: Sampler, animal: Pick<Animal, 'kind' | 'y' | 'x' | 'z' | 'flee' | 'stuck'>, x: number, z: number) {
  if (!onIsland(x, z)) return false
  const ground = groundBelow(world, x, z, animal.y)
  if (ground < -0.4) return false
  const leaping = animal.flee > 0 || (animal.stuck ?? 0) >= STUCK_JUMP
  if (ground - animal.y > S + 0.01 || (!leaping && animal.y - ground > 1.6)) return false
  if (BUILT.has(world.get(bx(x), by(ground - 0.01), bz(z)))) return false
  const depth = insideBuilding(x, z)
  if (depth < 1 && depth < insideBuilding(animal.x, animal.z) - 1e-6) return false
  const { height, radius } = specs[animal.kind]
  return clearAt(world, x, ground, z, height, radius)
}

function create(id: number, kind: AnimalKind, x: number, y: number, z: number, rng: () => number): Animal {
  return {
    id, kind, x, y, z, yaw: rng() * Math.PI * 2, tx: x, tz: z, walking: false,
    timer: 1 + rng() * 4, vy: 0, sheared: 0, cooldown: 0, flee: 0, hurt: 0, lay: 40 + rng() * 60, stride: 0, stuck: 0,
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
        animal.stuck = 0
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
      // Keep clear of the building areas so herds do not stand in a blueprint; an animal inside one
      // heads out of it.
      const out = insideBuilding(animal.x, animal.z) < 1 && insideBuilding(tx, tz) > insideBuilding(animal.x, animal.z)
      if ((out || insideBuilding(tx, tz) >= 1) && onIsland(tx, tz)) {
        animal.tx = tx
        animal.tz = tz
        animal.walking = true
      } else {
        animal.timer = 0.5
      }
    }
  }
  if (!animal.walking) animal.stride *= 1 - Math.min(1, dt * 8)

  // Getting nowhere: on a roof, a wall top or a ledge it cannot leave by its usual steps. It soon
  // jumps down, and if even that fails it is found back in its meadow.
  if (!resting) {
    const free = [[S, 0], [-S, 0], [0, S], [0, -S]].some(([dx, dz]) => canStep(world, { ...animal, stuck: 0, flee: 0 }, animal.x + dx, animal.z + dz))
    const onBuilt = BUILT.has(world.get(bx(animal.x), by(animal.y - 0.01), bz(animal.z)))
    animal.stuck = free && !onBuilt ? 0 : (animal.stuck ?? 0) + dt
    if (animal.stuck >= STUCK_JUMP && !animal.walking) {
      // Pick the nearest way off: the first neighbour it may now leap to.
      const offset = (rng() * 4) | 0
      for (let i = 0; i < 4; i++) {
        const angle = ((i + offset) % 4) * Math.PI / 2
        const tx = animal.x + Math.sin(angle) * 1.2, tz = animal.z + Math.cos(angle) * 1.2
        if (canStep(world, animal, animal.x + Math.sin(angle) * S, animal.z + Math.cos(angle) * S)) {
          animal.tx = tx; animal.tz = tz; animal.walking = true
          break
        }
      }
    }
    if (animal.stuck >= STUCK_HOME) goHome(world, animal)
  }

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

/** Puts an animal back in its meadow, on open ground near where its herd started. */
export function goHome(world: Sampler, animal: Animal) {
  const [cx, cz] = meadows[animal.kind]
  for (let ring = 0; ring < 12; ring++) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + animal.id
      const x = cx + Math.cos(angle) * ring * 0.5, z = cz + Math.sin(angle) * ring * 0.5
      const y = groundBelow(world, x, z, 30)
      const home = { ...animal, x, y, z, stuck: 0, flee: 0 }
      if (y < -0.4 || !canStep(world, home, x, z)) continue
      Object.assign(animal, { x, y, z, tx: x, tz: z, vy: 0, walking: false, timer: 2, stuck: 0 })
      return true
    }
  }
  return false
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
