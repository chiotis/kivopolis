import { Block, isKnownBlock, isOpaque, isSolid, isWater, lightTable } from './blocks'
import { nextWater } from './flow'
import { generate, SEED } from './generate'
import { chunkKey, chunkRecords, readRecord, worldHeader, writeRecord, type ChunkRecord } from '../game/save'

import { CHUNK, CX, CZ, SX, SY, SZ, bx, bz, chunkOfCell, index, inside, wy } from './grid'

export * from './grid'

type Listener = (chunks: number[]) => void

/** Seconds between water ticks. */
export const WATER_TICK = 0.25
/** Cells updated per tick at most; the rest wait for the next tick, so a flooded cave cannot stall a frame. */
const TICK_LIMIT = 4096
const NEIGHBOURS = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const

export class VoxelWorld {
  readonly data = new Uint8Array(SX * SY * SZ)
  /** Player edits on top of the generated terrain: grid index → block id. */
  readonly edits = new Map<number, number>()
  /** Block light (0–15) from lamps, spread one level per block through non-opaque cells. */
  readonly light = new Uint8Array(SX * SY * SZ)
  private lamps = new Set<number>()
  private lit: number[] = []
  private listeners = new Set<Listener>()
  /** Cells whose water may change on the next tick. */
  private pending = new Set<number>()
  /** Water ticks run since the world was generated or loaded. */
  ticks = 0

  constructor() { generate(this) }

  get(x: number, y: number, z: number) {
    if (y < 0) return Block.bedrock
    if (!inside(x, y, z)) return Block.air
    return this.data[index(x, y, z)]
  }

  /** Used by the generator: writes without recording an edit or notifying. */
  fill(x: number, y: number, z: number, id: number) {
    if (inside(x, y, z)) this.data[index(x, y, z)] = id
  }

  set(x: number, y: number, z: number, id: number) {
    if (!inside(x, y, z) || !isKnownBlock(id)) return false
    const i = index(x, y, z)
    const old = this.data[i]
    if (old === id) return false
    this.data[i] = id
    this.edits.set(i, id)
    const chunks = new Set(affectedChunks(x, z))
    // Water around the change may run in (or drain away) on the next tick.
    this.wake(x, y, z)
    // Relight when a lamp comes or goes, or when a block opens or closes a lit space.
    if (lightTable[old] || lightTable[id] || this.litAround(x, y, z)) {
      if (lightTable[id]) this.lamps.add(i)
      else this.lamps.delete(i)
      for (const chunk of this.relight()) chunks.add(chunk)
    }
    this.emit([...chunks])
    return true
  }

  /** Queues a cell and its six neighbours for the next water tick when water is involved. */
  private wake(x: number, y: number, z: number) {
    if (!NEIGHBOURS.some(([dx, dy, dz]) => isWater(this.get(x + dx, y + dy, z + dz)))) return
    for (const [dx, dy, dz] of NEIGHBOURS) if (inside(x + dx, y + dy, z + dz)) this.pending.add(index(x + dx, y + dy, z + dz))
  }

  /** True while water is still running somewhere. */
  get flowing() { return this.pending.size > 0 }

  /**
   * One step of flowing water. Every queued cell is judged against the world as it was at the start
   * of the tick, in ascending cell order, so the result never depends on timing or on who runs it.
   */
  tickWater() {
    if (!this.pending.size) return false
    const queue = [...this.pending].sort((a, b) => a - b)
    const now = queue.slice(0, TICK_LIMIT)
    this.pending = new Set(queue.slice(TICK_LIMIT))
    const plane = SX * SZ
    const get = (x: number, y: number, z: number) => this.get(x, y, z)
    const changes: [number, number][] = []
    for (const i of now) {
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / plane)
      const next = nextWater(get, x, y, z)
      if (next !== this.data[i]) changes.push([i, next])
    }
    const chunks = new Set<number>()
    for (const [i, id] of changes) {
      this.data[i] = id
      this.edits.set(i, id)
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / plane)
      for (const chunk of affectedChunks(x, z)) chunks.add(chunk)
      for (const [dx, dy, dz] of NEIGHBOURS) if (inside(x + dx, y + dy, z + dz)) this.pending.add(index(x + dx, y + dy, z + dz))
    }
    this.ticks++
    if (chunks.size) this.emit([...chunks])
    return true
  }

  lightAt(x: number, y: number, z: number) {
    return inside(x, y, z) ? this.light[index(x, y, z)] : 0
  }

  private litAround(x: number, y: number, z: number) {
    return this.lightAt(x, y, z) > 0 || this.lightAt(x + 1, y, z) > 0 || this.lightAt(x - 1, y, z) > 0
      || this.lightAt(x, y + 1, z) > 0 || this.lightAt(x, y - 1, z) > 0
      || this.lightAt(x, y, z + 1) > 0 || this.lightAt(x, y, z - 1) > 0
  }

  /** Recomputes all lamp light (lamps are few) and returns the chunks whose lighting changed. */
  private relight() {
    const { light, data } = this
    const before = new Map<number, number>()
    for (const i of this.lit) { before.set(i, light[i]); light[i] = 0 }
    const lit: number[] = []
    const queue: number[] = []
    for (const i of this.lamps) {
      const level = lightTable[data[i]]
      if (!level || light[i] >= level) continue
      if (!light[i]) lit.push(i)
      light[i] = level
      queue.push(i)
    }
    const plane = SX * SZ
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]
      const next = light[i] - 1
      if (next <= 0) continue
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / plane)
      const spread = (n: number) => {
        if (light[n] >= next || isOpaque(data[n])) return
        if (!light[n]) lit.push(n)
        light[n] = next
        queue.push(n)
      }
      if (x > 0) spread(i - 1)
      if (x < SX - 1) spread(i + 1)
      if (z > 0) spread(i - SX)
      if (z < SZ - 1) spread(i + SX)
      if (y > 0) spread(i - plane)
      if (y < SY - 1) spread(i + plane)
    }
    this.lit = lit
    const chunks = new Set<number>()
    const columns = new Set<number>()
    for (const i of new Set([...before.keys(), ...lit])) {
      if ((before.get(i) ?? 0) === light[i]) continue
      const column = i % plane
      if (columns.has(column)) continue
      columns.add(column)
      for (const chunk of affectedChunks(column % SX, Math.floor(column / SX))) chunks.add(chunk)
    }
    return chunks
  }

  private findLamps() {
    this.lamps.clear()
    for (let i = 0; i < this.data.length; i++) if (lightTable[this.data[i]]) this.lamps.add(i)
  }

  solidAt(x: number, y: number, z: number) { return isSolid(this.get(x, y, z)) }

  /** World y of the top surface of the highest solid block in the column under (x, z). */
  surface(x: number, z: number) {
    const ix = bx(x), iz = bz(z)
    for (let y = SY - 1; y >= 0; y--) if (this.solidAt(ix, y, iz)) return wy(y + 1)
    return wy(0)
  }

  regenerate(edits: Iterable<[number, number]> = []) {
    this.data.fill(0)
    this.edits.clear()
    generate(this)
    for (const [i, id] of edits) {
      if (i >= 0 && i < this.data.length && isKnownBlock(id)) {
        this.data[i] = id
        this.edits.set(i, id)
      }
    }
    // Water that was still running when the game was saved carries on.
    this.pending.clear()
    this.ticks = 0
    for (const i of this.edits.keys()) {
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ))
      this.wake(x, y, z)
    }
    this.findLamps()
    this.relight()
    this.emit(Array.from({ length: CX * CZ }, (_, chunk) => chunk))
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(chunks: number[]) { for (const listener of this.listeners) listener(chunks) }
}

/** Chunks whose mesh can change when (x, z) changes: its own, plus neighbours for border faces and AO. */
export function affectedChunks(x: number, z: number) {
  const result = new Set<number>()
  for (const dx of [-1, 0, 1]) {
    for (const dz of [-1, 0, 1]) {
      const cx = Math.floor((x + dx) / CHUNK), cz = Math.floor((z + dz) / CHUNK)
      if (cx >= 0 && cx < CX && cz >= 0 && cz < CZ) result.add(cz * CX + cx)
    }
  }
  return [...result]
}

// ---- Singleton and persistence -------------------------------------------------------------

let instance: VoxelWorld | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
/** Chunks whose edits changed since the last save. */
const unsaved = new Set<number>()

function readEdits(): [number, number][] {
  const pairs: [number, number][] = []
  for (const record of chunkRecords().values()) {
    const { cells, ids } = record ?? {}
    if (!(cells instanceof Uint32Array) || !(ids instanceof Uint8Array) || cells.length !== ids.length) continue
    for (let i = 0; i < cells.length; i++) pairs.push([cells[i], ids[i]])
  }
  return pairs
}

/** Writes one record per changed chunk; a chunk back to its generated state is deleted. */
function writeEdits(world: VoxelWorld) {
  const grouped = new Map<number, [number[], number[]]>()
  for (const chunk of unsaved) grouped.set(chunk, [[], []])
  for (const [cell, id] of world.edits) {
    const group = grouped.get(chunkOfCell(cell))
    if (group) { group[0].push(cell); group[1].push(id) }
  }
  unsaved.clear()
  if (!readRecord('world')) writeRecord('world', worldHeader(SEED))
  for (const [chunk, [cells, ids]] of grouped) {
    writeRecord(chunkKey(chunk), cells.length ? { cells: Uint32Array.from(cells), ids: Uint8Array.from(ids) } satisfies ChunkRecord : undefined, 0)
  }
}

export function getWorld() {
  if (!instance) {
    const world = new VoxelWorld()
    const edits = readEdits()
    if (edits.length) world.regenerate(edits)
    world.subscribe((chunks) => {
      for (const chunk of chunks) unsaved.add(chunk)
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => writeEdits(world), 400)
    })
    instance = world
  }
  return instance
}

/** Restores the generated island and forgets all player edits. */
export function resetWorld() {
  clearTimeout(saveTimer)
  unsaved.clear()
  for (const chunk of chunkRecords().keys()) writeRecord(chunkKey(chunk), undefined)
  if (instance) {
    instance.regenerate()
    clearTimeout(saveTimer)
    unsaved.clear()
  }
}
