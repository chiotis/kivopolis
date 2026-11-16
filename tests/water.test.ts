import { describe, expect, it } from 'vitest'
import { islandEdge } from '../src/game/terrain'
import { Block, isEmpty, isWater } from '../src/voxel/blocks'
import { strength, submerged } from '../src/voxel/flow'
import { matchRecipe } from '../src/game/recipes'
import { meshChunk, meshWater, type Sampler } from '../src/voxel/mesher'
import { newBody, stepBody, type Limits } from '../src/voxel/physics'
import { raycast } from '../src/voxel/raycast'
import { OX, OY, OZ, S, SEA_LEVEL, SEA_Y, SX, VoxelWorld, bx, bz, wx, wy } from '../src/voxel/world'

/** Runs water ticks until nothing moves any more. */
function settle(world: VoxelWorld) {
  let ticks = 0
  while (world.flowing && ticks < 400) { world.tickWater(); ticks++ }
  expect(world.flowing).toBe(false)
  return ticks
}

const open: Limits = { circles: [], bounds: () => true }
const input = { x: 0, z: 0, sprint: false, jump: false, crouch: false }

function grid(cells: [number, number, number, number][]): Sampler {
  const map = new Map(cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]))
  return { get: (x, y, z) => (y < 0 ? Block.bedrock : map.get(`${x},${y},${z}`) ?? Block.air) }
}

/** A pool: a sandy floor with water `depth` blocks deep above it. */
function pool(depth: number) {
  const cells: [number, number, number, number][] = []
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      cells.push([OX + x, OY - depth - 1, OZ + z, Block.sand])
      for (let y = 0; y < depth; y++) cells.push([OX + x, OY - depth + y, OZ + z, Block.water])
    }
  }
  return grid(cells)
}

describe('the sea', () => {
  const world = new VoxelWorld()

  it('fills the open sea up to sea level and leaves the island dry', () => {
    // Due south, well past the shore.
    const z = bz(islandEdge(Math.PI) + 2.5)
    expect(world.get(OX, SEA_Y, z)).toBe(Block.water)
    expect(world.get(OX, SEA_Y + 1, z)).toBe(Block.air)
    // Deep enough to swim: at least four blocks of water.
    for (let y = SEA_Y - 3; y <= SEA_Y; y++) expect(world.get(OX, y, z)).toBe(Block.water)
    // The orchestra floor at the centre has no water on it.
    expect(world.get(OX, OY, OZ)).toBe(Block.air)
    expect(SEA_LEVEL).toBeCloseTo(-0.75)
  })

  it('floods a hole dug next to it, and the space the hole leads to', () => {
    const shore = new VoxelWorld()
    // Find a solid block at sea level that touches the sea on its south side.
    let x = OX, z = 0
    for (z = SX - 1; z > 0 && !(shore.get(x, SEA_Y, z) !== Block.water && shore.get(x, SEA_Y, z + 1) === Block.water); z--);
    expect(isEmpty(shore.get(x, SEA_Y, z))).toBe(false)
    // An enclosed pocket just inland of it, one block down.
    shore.set(x, SEA_Y - 1, z - 1, Block.air)
    expect(shore.get(x, SEA_Y - 1, z - 1)).toBe(Block.air)
    // Breaking the shore block lets the sea in; it runs down and along into the pocket.
    shore.set(x, SEA_Y, z, Block.air)
    // The water arrives on the next tick, not at once.
    expect(shore.get(x, SEA_Y, z)).toBe(Block.air)
    settle(shore)
    expect(shore.get(x, SEA_Y, z)).toBe(Block.water)
    shore.set(x, SEA_Y - 1, z, Block.air)
    settle(shore)
    expect(shore.get(x, SEA_Y - 1, z)).toBe(Block.water)
    expect(shore.get(x, SEA_Y - 1, z - 1)).toBe(Block.water)
    // Above sea level a dug hole stays dry.
    shore.set(x, SEA_Y + 1, z, Block.air)
    settle(shore)
    expect(shore.get(x, SEA_Y + 1, z)).toBe(Block.air)
  })

  it('is passed through by the crosshair, so blocks behind or under water can be reached', () => {
    const water = grid([[OX, OY, OZ - 2, Block.water], [OX, OY, OZ - 4, Block.limestone]])
    expect(raycast(water, [S / 2, S / 2, 0], [0, 0, -1], 5)).toMatchObject({ z: OZ - 4 })
  })
})

/** A flat stone floor high above the theatre, where nothing else is in the way. */
const FLOOR = 38
function terrace(world: VoxelWorld, half = 10) {
  for (let x = -half; x <= half; x++) for (let z = -half; z <= half; z++) world.set(OX + x, FLOOR, OZ + z, Block.limestone)
}

describe('flowing water', () => {
  it('spreads seven blocks from a source on flat ground, one level lower each block', () => {
    const world = new VoxelWorld()
    terrace(world)
    world.set(OX, FLOOR + 1, OZ, Block.water)
    const ticks = settle(world)
    // One block per tick, so the flow is seen running rather than appearing all at once.
    expect(ticks).toBeGreaterThanOrEqual(7)
    for (let d = 1; d <= 7; d++) {
      expect(strength(world.get(OX + d, FLOOR + 1, OZ))).toBe(8 - d)
      expect(strength(world.get(OX + d - 3, FLOOR + 1, OZ + 3))).toBe(Math.max(0, 8 - Math.abs(d - 3) - 3))
    }
    expect(world.get(OX + 8, FLOOR + 1, OZ)).toBe(Block.air)
    // Water never climbs: the cell above the source stays dry.
    expect(world.get(OX, FLOOR + 2, OZ)).toBe(Block.air)
  })

  it('falls over a step and spreads again below it', () => {
    const world = new VoxelWorld()
    terrace(world)
    // A drop of three blocks at x = +3: the floor continues lower down.
    for (let x = 3; x <= 10; x++) for (let z = -10; z <= 10; z++) world.set(OX + x, FLOOR, OZ + z, Block.air)
    for (let x = 3; x <= 12; x++) for (let z = -10; z <= 10; z++) world.set(OX + x, FLOOR - 3, OZ + z, Block.limestone)
    world.set(OX, FLOOR + 1, OZ, Block.water)
    settle(world)
    // Strength 5 at the edge; it falls, then starts again at 7 on the lower floor.
    expect(strength(world.get(OX + 3, FLOOR + 1, OZ))).toBe(5)
    expect(strength(world.get(OX + 3, FLOOR - 1, OZ))).toBe(7)
    expect(strength(world.get(OX + 4, FLOOR - 2, OZ))).toBe(6)
    expect(strength(world.get(OX + 9, FLOOR - 2, OZ))).toBe(1)
    // Falling water does not spread sideways in mid-air.
    expect(world.get(OX + 4, FLOOR + 1, OZ)).toBe(Block.air)
  })

  it('dries up when its source is taken away', () => {
    const world = new VoxelWorld()
    terrace(world)
    world.set(OX, FLOOR + 1, OZ, Block.water)
    settle(world)
    world.set(OX, FLOOR + 1, OZ, Block.air)
    settle(world)
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) expect(world.get(OX + x, FLOOR + 1, OZ + z)).toBe(Block.air)
  })

  it('gives the same water for the same edits, even when a save is reloaded halfway', () => {
    const run = (stopAt?: number) => {
      let world = new VoxelWorld()
      terrace(world)
      world.set(OX - 2, FLOOR + 1, OZ, Block.water)
      world.set(OX + 3, FLOOR + 1, OZ + 1, Block.water)
      for (let i = 0; stopAt !== undefined && i < stopAt; i++) world.tickWater()
      if (stopAt !== undefined) {
        // Saving keeps only the edits; loading them must carry the water on.
        const edits = [...world.edits]
        world = new VoxelWorld()
        world.regenerate(edits)
      }
      settle(world)
      return [...world.edits].filter(([, id]) => isWater(id)).sort((a, b) => a[0] - b[0])
    }
    const whole = run()
    expect(whole.length).toBeGreaterThan(100)
    expect(run(3)).toEqual(whole)
  })

  it('is only deep enough to swim in near its source', () => {
    const world = new VoxelWorld()
    terrace(world)
    world.set(OX, FLOOR + 1, OZ, Block.water)
    settle(world)
    const get = (x: number, y: number, z: number) => world.get(x, y, z)
    expect(submerged(get, OX, FLOOR + 1.3, OZ)).toBe(true)
    // A thin edge of the flow only wets the feet.
    expect(submerged(get, OX + 6, FLOOR + 1.05, OZ)).toBe(true)
    expect(submerged(get, OX + 6, FLOOR + 1.3, OZ)).toBe(false)
  })

  it('slopes its surface down from the source', () => {
    const world = new VoxelWorld()
    terrace(world)
    world.set(OX, FLOOR + 1, OZ, Block.water)
    settle(world)
    const cx = Math.floor(OX / 16), cz = Math.floor(OZ / 16)
    const mesh = meshWater(world, cx, cz)
    let high = -Infinity, low = Infinity
    for (let i = 1; i < mesh.positions.length; i += 3) {
      const y = mesh.positions[i]
      if (y <= wy(FLOOR + 1) + 0.001) continue
      high = Math.max(high, y)
      low = Math.min(low, y)
    }
    expect(high).toBeLessThanOrEqual(wy(FLOOR + 1) + S / 2 + 0.001)
    expect(low).toBeLessThan(wy(FLOOR + 1) + S * 0.2)
  })
})

describe('the hydria', () => {
  it('is shaped from three terracotta tiles at the workshop', () => {
    const t = { item: 'terracotta', count: 1 }
    expect(matchRecipe([t, null, t, null, t, null, null, null, null], 3)?.result).toEqual({ item: 'hydria', count: 1 })
  })
})

describe('water mesh', () => {
  it('draws only faces open to air, with the surface half a block down', () => {
    const one = grid([[1, 5, 1, Block.water]])
    const mesh = meshWater(one, 0, 0)
    expect(mesh.faces).toBe(6)
    const ys = new Set<number>()
    for (let i = 1; i < mesh.positions.length; i += 3) ys.add(Math.round(mesh.positions[i] * 1000) / 1000)
    expect([...ys].sort((a, b) => a - b)).toEqual([wy(5), wy(5) + S / 2])
    // Water is not part of the solid terrain mesh, but the sand under it is.
    expect(meshChunk(one, 0, 0).faces).toBe(0)
    const floor = grid([[1, 4, 1, Block.sand], [1, 5, 1, Block.water]])
    expect(meshChunk(floor, 0, 0).faces).toBe(6)
    expect(meshWater(floor, 0, 0).faces).toBe(5)
  })

  it('leaves out the walls at the edge of the world, where the flat sea continues', () => {
    const edge = grid([[0, 5, 1, Block.water], [0, 4, 1, Block.sand]])
    expect(meshWater(edge, 0, 0).faces).toBe(4)
    expect(meshChunk(edge, 0, 0).faces).toBe(5)
  })
})

describe('swimming', () => {
  it('floats slowly instead of falling, rises with jump and sinks with crouch', () => {
    const water = pool(6)
    const body = newBody(0.1, wy(OY - 2), 0.1)
    stepBody(water, body, input, 1 / 60, open)
    expect(body.inWater).toBe(true)
    for (let i = 0; i < 30; i++) stepBody(water, body, input, 1 / 60, open)
    expect(body.velocity.y).toBeGreaterThan(-1.2)

    const start = body.position.y
    for (let i = 0; i < 30; i++) stepBody(water, body, { ...input, jump: true }, 1 / 60, open)
    expect(body.position.y).toBeGreaterThan(start)
    const high = body.position.y
    for (let i = 0; i < 30; i++) stepBody(water, body, { ...input, crouch: true }, 1 / 60, open)
    expect(body.position.y).toBeLessThan(high)
    expect(body.crouching).toBe(false)
  })

  it('moves more slowly in water than on land', () => {
    const water = pool(6)
    const swimmer = newBody(-1, wy(OY - 3), 0.1)
    for (let i = 0; i < 60; i++) stepBody(water, swimmer, { ...input, x: 1, jump: true }, 1 / 60, open)
    expect(swimmer.position.x + 1).toBeLessThan(3.45 * 0.6)
    expect(swimmer.position.x + 1).toBeGreaterThan(1)
  })

  it('climbs out over a one-block ledge', () => {
    const cells: [number, number, number, number][] = []
    for (let x = -4; x <= 8; x++) {
      for (let z = -2; z <= 2; z++) {
        cells.push([OX + x, OY - 3, OZ + z, Block.sand])
        if (x < 2) for (let y = OY - 2; y < OY; y++) cells.push([OX + x, y, OZ + z, Block.water])
        else for (let y = OY - 2; y < OY; y++) cells.push([OX + x, y, OZ + z, Block.sand])
      }
    }
    const shore = grid(cells)
    const body = newBody(wx(OX + 1) + 0.2, wy(OY - 1) + 0.05, 0.1)
    for (let i = 0; i < 45; i++) stepBody(shore, body, { ...input, x: 1, jump: true }, 1 / 60, open)
    // Stand still on the ledge so the last jump lands.
    for (let i = 0; i < 60; i++) stepBody(shore, body, input, 1 / 60, open)
    expect(bx(body.position.x)).toBeGreaterThanOrEqual(OX + 2)
    expect(body.onGround).toBe(true)
    expect(body.inWater).toBe(false)
    expect(body.position.y).toBeCloseTo(wy(OY), 2)
  })
})
