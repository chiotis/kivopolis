import { beforeEach, describe, expect, it } from 'vitest'
import { ground } from '../src/game/terrain'
import { cells } from '../src/game/blueprints/theatre'
import { Block } from '../src/voxel/blocks'
import { level } from '../src/voxel/generate'
import { meshChunk, type Sampler } from '../src/voxel/mesher'
import { newBody, stepBody, type Limits } from '../src/voxel/physics'
import { raycast } from '../src/voxel/raycast'
import { CHUNK, OX, OY, OZ, S, SX, SZ, VoxelWorld, affectedChunks, bx, by, bz, chunkOfCell, getWorld, index, resetWorld, wy } from '../src/voxel/world'
import { chunkKey, fromLegacy, fromOldCell, oldChunkOf, readRecord, upgradeRecords, type ChunkRecord } from '../src/game/save'

/** A tiny in-memory grid for isolated mesher/physics checks. */
function grid(cells: [number, number, number, number][]): Sampler {
  const map = new Map(cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]))
  return { get: (x, y, z) => (y < 0 ? Block.bedrock : map.get(`${x},${y},${z}`) ?? Block.air) }
}
const open: Limits = { circles: [], bounds: () => true }

describe('voxel world', () => {
  it('generates the same island every time and keeps the theatre tiers on block tops', () => {
    const a = new VoxelWorld(), b = new VoxelWorld()
    // A plain loop: a deep equality check on 7 million cells is far too slow.
    let differences = 0
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) differences++
    expect(differences).toBe(0)
    // Every seat of the blueprint sits directly on its terrace, one block per row.
    for (const seat of cells.filter((cell) => cell.mission === 'seats' || cell.mission === 'koilon')) {
      expect(a.solidAt(seat.x, seat.y - 1, seat.z)).toBe(true)
      expect(a.get(seat.x, seat.y, seat.z)).toBe(Block.air)
    }
    expect(level(ground(0, 0))).toBe(0)
    // The diazoma terrace is level, and its gravel course starts as an empty, supported trench.
    const diazoma = new Set(cells.filter((cell) => cell.mission === 'diazoma').map(({ x, y, z }) => `${x},${y},${z}`))
    for (const [x, z] of [[0, -7.9], [-4.5, -6.4], [5.6, -5.4]] as const) {
      expect(level(ground(x, z))).toBe(2)
      expect(diazoma.has(`${bx(x)},${by(0.75)},${bz(z)}`)).toBe(true)
      expect(a.get(bx(x), by(0.75), bz(z))).toBe(Block.air)
      expect(a.solidAt(bx(x), by(0.25), bz(z))).toBe(true)
    }
  }, 20_000)

  it('records edits, notifies the affected chunks and ignores no-op writes', () => {
    const world = new VoxelWorld()
    const seen: number[][] = []
    world.subscribe((chunks) => seen.push(chunks))
    const [x, y, z] = [CHUNK * 2, 30, CHUNK * 3 + 5]
    expect(world.set(x, y, z, Block.marble)).toBe(true)
    expect(world.set(x, y, z, Block.marble)).toBe(false)
    expect(world.get(x, y, z)).toBe(Block.marble)
    expect(world.edits.size).toBe(1)
    expect(seen).toHaveLength(1)
    // On a chunk border the neighbour's faces and AO change too.
    expect(seen[0].sort()).toEqual(affectedChunks(x, z).sort())
    expect(seen[0]).toHaveLength(2)
  })

  it('saves edits per chunk and restores the generated island on reset', async () => {
    const world = getWorld()
    const original = world.get(OX, 40, OZ)
    world.set(OX, 40, OZ, Block.terracotta)
    await new Promise((resolve) => setTimeout(resolve, 450))
    const cell = index(OX, 40, OZ)
    const key = chunkKey(chunkOfCell(cell))
    const record = readRecord<ChunkRecord>(key)!
    expect([...record.cells]).toEqual([cell])
    expect([...record.ids]).toEqual([Block.terracotta])
    expect(readRecord('world')).toEqual({ version: 3, seed: 0, size: [SX, SZ] })
    resetWorld()
    expect(world.get(OX, 40, OZ)).toBe(original)
    expect(readRecord(key)).toBeUndefined()
  })

  it('moves a version 1 LocalStorage save into chunk records', () => {
    const a = (40 * 144 + 3) * 144 + 3, b = (40 * 144 + 100) * 144 + 120
    const storage: Record<string, string> = {
      'ancient-polis-save': JSON.stringify({ version: 1, progress: { placed: ['x'] }, settings: {} }),
      'ancient-polis-world': JSON.stringify({ version: 1, edits: [a, Block.marble, b, Block.air, 'bad', 3] }),
    }
    const records = fromLegacy((key) => storage[key] ?? null, oldChunkOf, 0)!
    expect(records.get('game')).toEqual({ version: 1, progress: { placed: ['x'] }, settings: {} })
    expect(records.has('inventory')).toBe(false)
    expect([...(records.get(chunkKey(0)) as ChunkRecord).cells]).toEqual([a])
    expect([...(records.get(chunkKey(oldChunkOf(b))) as ChunkRecord).ids]).toEqual([Block.air])
    expect(oldChunkOf(b)).toBe(6 * 9 + 7)
    expect(fromLegacy(() => null, oldChunkOf, 0)).toBeNull()
  })

  it('moves version 2 saves onto the larger grid, kilns included', () => {
    const a = (40 * 144 + 3) * 144 + 3, b = (20 * 144 + 100) * 144 + 120
    const records = new Map<string, unknown>([
      ['world', { version: 2, seed: 0 }],
      [chunkKey(oldChunkOf(a)), { cells: Uint32Array.from([a]), ids: Uint8Array.from([Block.marble]) }],
      [chunkKey(oldChunkOf(b)), { cells: Uint32Array.from([b]), ids: Uint8Array.from([Block.kiln]) }],
      ['inventory', { version: 1, slots: [], kilns: { [String(b)]: { progress: 0.5 } } }],
    ])
    const changes = upgradeRecords(records, 0)
    const shift = (SX - 144) / 2
    const na = index(3 + shift, 40, 3 + shift), nb = index(120 + shift, 20, 100 + shift)
    expect(fromOldCell(a)).toBe(na)
    expect([...(changes.get(chunkKey(chunkOfCell(na))) as ChunkRecord).cells]).toEqual([na])
    expect([...(changes.get(chunkKey(chunkOfCell(nb))) as ChunkRecord).ids]).toEqual([Block.kiln])
    // The old chunk keys are removed, unless a new chunk happens to reuse the same key.
    expect(changes.has(chunkKey(oldChunkOf(a)))).toBe(true)
    expect((changes.get('inventory') as { kilns: Record<string, unknown> }).kilns).toEqual({ [String(nb)]: { progress: 0.5 } })
    expect(changes.get('world')).toEqual({ version: 3, seed: 0, size: [SX, SZ] })
    // A version 3 save is left alone.
    expect(upgradeRecords(new Map([['world', changes.get('world')]]), 0).size).toBe(0)
  })
})

describe('mesher', () => {
  it('culls hidden faces between neighbouring opaque blocks', () => {
    expect(meshChunk(grid([[1, 5, 1, Block.marble]]), 0, 0).faces).toBe(6)
    expect(meshChunk(grid([[1, 5, 1, Block.marble], [2, 5, 1, Block.marble]]), 0, 0).faces).toBe(10)
  })

  it('darkens corners next to occluding blocks', () => {
    const lone = meshChunk(grid([[1, 5, 1, Block.marble]]), 0, 0)
    expect(Math.min(...lone.colors)).toBe(1)
    const nook = meshChunk(grid([[1, 5, 1, Block.marble], [2, 6, 1, Block.marble]]), 0, 0)
    expect(Math.min(...nook.colors)).toBeLessThan(1)
  })
})

describe('raycast', () => {
  it('returns the first block and the face it entered through', () => {
    const world = grid([[OX, OY, OZ - 4, Block.limestone]])
    const hit = raycast(world, [S / 2, S / 2, 0], [0, 0, -1], 5)
    expect(hit).toMatchObject({ x: OX, y: OY, z: OZ - 4, normal: [0, 0, 1] })
    expect(hit!.distance).toBeCloseTo(3 * S)
    expect(raycast(world, [S / 2, S / 2, 0], [0, 0, -1], 1)).toBeNull()
  })
})

describe('player physics', () => {
  const floor: [number, number, number, number][] = []
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) floor.push([OX + x, OY - 1, OZ + z, Block.grass])
  const input = { x: 0, z: 0, sprint: false, jump: false, crouch: false }

  it('falls onto the ground and rests flush on top', () => {
    const body = newBody(0.1, 2, 0.1)
    for (let i = 0; i < 90; i++) stepBody(grid(floor), body, input, 1 / 60, open)
    expect(body.onGround).toBe(true)
    expect(body.position.y).toBeCloseTo(wy(OY), 3)
  })

  it('climbs a one-block step automatically but stops at a two-block wall', () => {
    const step = grid([...floor, [OX + 2, OY, OZ, Block.limestone]])
    const body = newBody(0.25, 0, 0.25)
    for (let i = 0; i < 24; i++) stepBody(step, body, { ...input, x: 1 }, 1 / 60, open)
    expect(bx(body.position.x)).toBe(OX + 2)
    expect(body.position.y).toBeCloseTo(S, 2)

    const wall = grid([...floor, [OX + 2, OY, OZ, Block.limestone], [OX + 2, OY + 1, OZ, Block.limestone]])
    const blocked = newBody(0.25, 0, 0.25)
    for (let i = 0; i < 80; i++) stepBody(wall, blocked, { ...input, x: 1 }, 1 / 60, open)
    expect(blocked.position.x).toBeLessThan(1)
    expect(bx(blocked.position.x)).toBe(OX + 1)
  })

  it('jumps high enough to clear two blocks', () => {
    const body = newBody(0.25, 0, 0.25)
    stepBody(grid(floor), body, input, 1 / 60, open)
    let peak = 0
    for (let i = 0; i < 60; i++) {
      stepBody(grid(floor), body, { ...input, jump: i === 0 }, 1 / 60, open)
      peak = Math.max(peak, body.position.y)
    }
    expect(peak).toBeGreaterThan(2 * S)
  })

  it('does not walk off a ledge while crouching', () => {
    const body = newBody(0.25, 0, 0.25)
    for (let i = 0; i < 200; i++) stepBody(grid(floor), body, { ...input, x: 1, crouch: true }, 1 / 60, open)
    expect(by(body.position.y)).toBe(OY)
    expect(bz(body.position.z)).toBe(OZ)
    // The body may overhang the edge by its radius, as long as it still touches the floor.
    expect(body.position.x).toBeLessThan(5 * S + 0.23)
  })
})

beforeEach(() => resetWorld())
