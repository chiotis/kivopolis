import { Block, isKnownBlock, isSolid } from './blocks'
import { generate } from './generate'

import { CHUNK, CX, CZ, SX, SY, SZ, bx, bz, index, inside, wy } from './grid'

export * from './grid'

type Listener = (chunks: number[]) => void

export class VoxelWorld {
  readonly data = new Uint8Array(SX * SY * SZ)
  /** Player edits on top of the generated terrain: grid index → block id. */
  readonly edits = new Map<number, number>()
  private listeners = new Set<Listener>()

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
    if (this.data[i] === id) return false
    this.data[i] = id
    this.edits.set(i, id)
    this.emit(affectedChunks(x, z))
    return true
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

export const worldSaveKey = 'ancient-polis-world'
interface SavedWorld { version: 1; edits: number[] }

let instance: VoxelWorld | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

function readEdits(): [number, number][] {
  try {
    const raw = globalThis.localStorage?.getItem(worldSaveKey)
    if (!raw) return []
    const data = JSON.parse(raw) as Partial<SavedWorld>
    if (data.version !== 1 || !Array.isArray(data.edits)) return []
    const pairs: [number, number][] = []
    for (let i = 0; i + 1 < data.edits.length; i += 2) {
      const [cell, id] = [data.edits[i], data.edits[i + 1]]
      if (Number.isInteger(cell) && Number.isInteger(id)) pairs.push([cell, id])
    }
    return pairs
  } catch {
    return []
  }
}

function writeEdits(world: VoxelWorld) {
  try {
    const edits: number[] = []
    for (const [cell, id] of world.edits) edits.push(cell, id)
    globalThis.localStorage?.setItem(worldSaveKey, JSON.stringify({ version: 1, edits } satisfies SavedWorld))
  } catch {
    // Storage is optional; the store reports save availability for the campaign.
  }
}

export function getWorld() {
  if (!instance) {
    const world = new VoxelWorld()
    const edits = readEdits()
    if (edits.length) world.regenerate(edits)
    world.subscribe(() => {
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
  try { globalThis.localStorage?.removeItem(worldSaveKey) } catch { /* optional */ }
  if (instance) {
    instance.regenerate()
    clearTimeout(saveTimer)
  }
}
