import { beforeEach, describe, expect, it, vi } from 'vitest'
import { advance, daylight, DAY_SECONDS, isNight, sunDirection } from '../src/game/daylight'
import { inventory, resetInventory, useInventory } from '../src/game/inventory'
import { matchRecipe } from '../src/game/recipes'
import { useGame, useShared } from '../src/game/store'
import { Block } from '../src/voxel/blocks'
import { meshChunk, type Sampler } from '../src/voxel/mesher'
import { newBody, stepBody, type Limits } from '../src/voxel/physics'
import { VoxelWorld, bx, by, bz, getWorld, wy } from '../src/voxel/world'
import { STUCK_HOME, canStep, groundBelow, insideBuilding, pickAnimal, spawnAnimals, startle, updateAnimal } from '../src/world/wildlife'
import { jumpTapped, playerState } from '../src/world/player'
import { islandEdge } from '../src/game/terrain'

const open: Limits = { circles: [], bounds: () => true }

describe('day and night', () => {
  it('rises in the east, peaks at noon and is dark at midnight', () => {
    expect(sunDirection(0.25)[0]).toBeGreaterThan(0.9)
    expect(sunDirection(0.5)[1]).toBeGreaterThan(0.9)
    expect(daylight(0.5)).toBe(1)
    expect(daylight(0)).toBe(0)
    expect(isNight(0.02)).toBe(true)
    expect(isNight(0.4)).toBe(false)
    // A full day takes DAY_SECONDS and wraps at midnight.
    expect(advance(0.9, DAY_SECONDS * 0.2)).toBeCloseTo(0.1)
  })
})

describe('lamp light', () => {
  it('spreads one level per block, stops at walls and goes out with the lamp', () => {
    const world = new VoxelWorld()
    const x = bx(6.5), z = bz(11), y = by(world.surface(6.5, 11))
    expect(world.get(x, y, z)).toBe(Block.air)
    const touched: number[][] = []
    world.subscribe((chunks) => touched.push(chunks))
    world.set(x, y, z, Block.lamp)
    expect(world.lightAt(x, y, z)).toBe(14)
    expect(world.lightAt(x, y + 1, z)).toBe(13)
    expect(world.lightAt(x, y + 3, z)).toBe(11)
    expect(world.lightAt(x, y - 1, z)).toBe(0) // the ground under it is solid
    // Relighting reports more chunks than the edit alone when light crosses a border.
    expect(touched.at(-1)!.length).toBeGreaterThan(0)

    // A wall beside the lamp casts a shadow behind it.
    world.set(x + 1, y + 1, z, Block.ashlar)
    expect(world.lightAt(x + 1, y + 1, z)).toBe(0)
    world.set(x, y, z, Block.air)
    for (let dy = 0; dy < 4; dy++) expect(world.lightAt(x, y + dy, z)).toBe(0)
  })

  it('reaches the mesh as a per-vertex value, and the lamp itself is full bright', () => {
    const cells = new Map([['0,0,0', Block.lamp], ['1,0,0', Block.ashlar]])
    const sampler: Sampler = {
      get: (x, y, z) => (y < 0 ? Block.bedrock : cells.get(`${x},${y},${z}`) ?? Block.air),
      lightAt: (x, y, z) => (Math.abs(x) + Math.abs(y) + Math.abs(z) <= 2 ? 12 : 0),
    }
    const mesh = meshChunk(sampler, 0, 0)
    expect(mesh.lights.length).toBe(mesh.positions.length / 3)
    expect(Math.max(...mesh.lights)).toBe(1)
    expect(Math.min(...mesh.lights)).toBeGreaterThan(0)
  })

  it('is crafted from clay on a stick', () => {
    expect(matchRecipe([{ item: 'clayLump', count: 1 }, null, { item: 'stick', count: 1 }, null], 2)?.result).toEqual({ item: 'lamp', count: 2 })
  })
})

describe('creative flight', () => {
  const flat: Sampler = { get: (_x, y) => (y < 16 ? Block.grass : Block.air) }

  it('rises, hovers without gravity and lands on touching the ground', () => {
    const body = newBody(0, wy(16), 0)
    body.flying = true
    for (let i = 0; i < 40; i++) stepBody(flat, body, { x: 0, z: 0, sprint: false, jump: true, crouch: false }, 0.05, open)
    const high = body.position.y
    expect(high).toBeGreaterThan(wy(16) + 3)
    for (let i = 0; i < 20; i++) stepBody(flat, body, { x: 0, z: 0, sprint: false, jump: false, crouch: false }, 0.05, open)
    expect(body.position.y).toBeGreaterThan(high - 0.6)
    for (let i = 0; i < 200 && body.flying; i++) stepBody(flat, body, { x: 0, z: 0, sprint: false, jump: false, crouch: true }, 0.05, open)
    expect(body.flying).toBe(false)
    expect(body.position.y).toBeCloseTo(wy(16), 2)
  })

  it('takes off on a double tap of jump only in creative', () => {
    playerState.body.flying = false
    jumpTapped(false); jumpTapped(false)
    expect(playerState.body.flying).toBe(false)
    jumpTapped(true); jumpTapped(true)
    expect(playerState.body.flying).toBe(true)
    jumpTapped(true); jumpTapped(true)
    expect(playerState.body.flying).toBe(false)
  })

  it('needs two creative taps even when the clock has only just started', () => {
    // A young clock (a fresh page or test worker) once made one tap after a toggle count as a second.
    const clock = vi.spyOn(performance, 'now').mockReturnValue(120)
    try {
      playerState.body.flying = false
      jumpTapped(false)
      jumpTapped(true)
      expect(playerState.body.flying).toBe(false)
      jumpTapped(true)
      expect(playerState.body.flying).toBe(true)
      clock.mockReturnValue(900)
      jumpTapped(true)
      expect(playerState.body.flying).toBe(true)
    } finally {
      clock.mockRestore()
    }
  })
})

describe('animals', () => {
  const world = new VoxelWorld()

  it('spawn the same herds on open grass, spaced apart', () => {
    const herd = spawnAnimals(world)
    expect(herd.map((a) => a.kind).sort()).toEqual([...Array(6).fill('chicken'), ...Array(4).fill('goat'), ...Array(6).fill('sheep')])
    expect(spawnAnimals(world).map(({ x, z }) => [x, z])).toEqual(herd.map(({ x, z }) => [x, z]))
    for (const animal of herd) {
      expect(world.get(bx(animal.x), by(animal.y - 0.01), bz(animal.z))).toBe(Block.grass)
      for (const other of herd) if (other !== animal) expect(Math.hypot(other.x - animal.x, other.z - animal.z)).toBeGreaterThan(1)
    }
  })

  it('wander for minutes without leaving the island, sinking into or floating above the ground', () => {
    const herd = spawnAnimals(world, 11)
    let seed = 3
    const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
    const start = herd.map(({ x, z }) => [x, z])
    for (let frame = 0; frame < 3600; frame++) for (const animal of herd) updateAnimal(animal, 0.05, { world, night: false, rng })
    herd.forEach((animal, i) => {
      expect(Math.hypot(animal.x, animal.z)).toBeLessThan(islandEdge(Math.atan2(animal.x, -animal.z)))
      expect(animal.y).toBeCloseTo(groundBelow(world, animal.x, animal.z, animal.y), 1)
      expect(canStep(world, animal, animal.x, animal.z)).toBe(true)
      expect(insideBuilding(animal.x, animal.z)).toBeGreaterThanOrEqual(1)
      void start[i]
    })
    expect(herd.some((animal, i) => Math.hypot(animal.x - start[i][0], animal.z - start[i][1]) > 1)).toBe(true)
  })

  it('rest at night unless startled, and run away when hit', () => {
    const [animal] = spawnAnimals(world)
    const before = [animal.x, animal.z]
    for (let i = 0; i < 400; i++) updateAnimal(animal, 0.05, { world, night: true })
    expect([animal.x, animal.z]).toEqual(before)
    startle(animal, animal.x - 1, animal.z)
    expect(animal.flee).toBeGreaterThan(0)
    for (let i = 0; i < 20; i++) updateAnimal(animal, 0.05, { world, night: true })
    expect(animal.x).toBeGreaterThan(before[0])
  })

  it('never climb onto built blocks or walk into a building area', () => {
    const built = new VoxelWorld()
    const goat = spawnAnimals(built).find((animal) => animal.kind === 'goat')!
    const floor = by(goat.y - 0.01)
    // A one-block ashlar step right in front of the goat: high enough to climb, but built.
    built.set(bx(goat.x + 0.5), floor + 1, bz(goat.z), Block.ashlar)
    expect(canStep(built, goat, goat.x + 0.5, goat.z)).toBe(false)
    // Inside the theatre's area it may only walk outwards.
    const inside = { ...goat, x: 9, z: 9 }
    const out = 1.02, deeper = 0.98
    expect(canStep(built, inside, 9 * deeper, 9 * deeper)).toBe(false)
    expect(insideBuilding(9 * out, 9 * out)).toBeGreaterThan(insideBuilding(9, 9))
  })

  it('jump down from a building they are stuck on, or are found back in their meadow', () => {
    const tower = new VoxelWorld()
    const goat = spawnAnimals(tower).find((animal) => animal.kind === 'goat')!
    const [ix, iz, floor] = [bx(goat.x), bz(goat.z), by(goat.y - 0.01)]
    // A 2 × 2 ashlar tower five blocks tall, with the goat standing on top: no usual step leads off it.
    for (let y = floor + 1; y <= floor + 5; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) tower.set(ix + dx, y, iz + dz, Block.ashlar)
    Object.assign(goat, { y: wy(floor + 6), walking: false, timer: 99, stuck: 0 })
    let seed = 5
    const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
    for (let frame = 0; frame < (STUCK_HOME + 2) / 0.05; frame++) updateAnimal(goat, 0.05, { world: tower, night: false, rng })
    expect(goat.y).toBeLessThan(wy(floor + 2))
    expect(tower.get(bx(goat.x), by(goat.y - 0.01), bz(goat.z))).not.toBe(Block.ashlar)
  })

  it('can be picked with a ray, nearest first', () => {
    const [a, b] = spawnAnimals(world)
    const eye = [a.x, a.y + 0.5, a.z - 3]
    expect(pickAnimal([a, b], eye, [0, 0, 1], 5)?.animal).toBe(a)
    expect(pickAnimal([a], eye, [0, 0, -1], 5)).toBeNull()
    expect(pickAnimal([a], eye, [0, 0, 1], 2)).toBeNull()
  })
})

describe('creative mode and history notes', () => {
  beforeEach(() => {
    useGame.getState().reset()
    resetInventory()
  })

  it('fills the empty hotbar with building blocks when switched on', () => {
    inventory.add({ item: 'stick', count: 3 })
    useGame.getState().setCreative(true)
    const slots = useInventory.getState().slots
    expect(slots[0]).toEqual({ item: 'stick', count: 3 })
    expect(slots.slice(1, 9).every((slot) => slot && slot.count === 64)).toBe(true)
    expect(useShared.getState().creative).toBe(true)
  })

  it('queues each history note once and remembers it in the save', () => {
    const { learn } = useGame.getState()
    learn('sheep'); learn('sheep'); learn('night')
    expect(useGame.getState().facts).toEqual(['sheep', 'night'])
    useGame.getState().dismissFact()
    expect(useGame.getState().facts).toEqual(['night'])
    learn('sheep')
    expect(useShared.getState().facts).toEqual(['sheep', 'night'])
  })

  it('gives instant palette stacks', () => {
    inventory.palette('marble')
    expect(useInventory.getState().cursor).toEqual({ item: 'marble', count: 64 })
    inventory.palette('lamp', true)
    expect(useInventory.getState().slots.some((slot) => slot?.item === 'lamp' && slot.count === 64)).toBe(true)
    inventory.palette(null)
    expect(useInventory.getState().cursor).toBeNull()
    void getWorld
  })
})
