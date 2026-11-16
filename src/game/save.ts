import { OLD_SX, OLD_SZ, SX, SY, SZ, chunkOfCell, index } from '../voxel/grid'

/**
 * Save version 3 (version 2 on a larger grid): one IndexedDB store holds the game, the inventory, the world header and one
 * record per edited chunk. Everything is read once at boot (`openSave`), so the rest of the game
 * reads its records synchronously; writes are queued and flushed together in one transaction.
 *
 * Without IndexedDB (tests, locked-down browsers) records live in memory only and the save
 * reports itself unavailable.
 */

export const DB_NAME = 'ancient-polis'
export const STORE = 'save'
/** LocalStorage keys of save version 1, moved into IndexedDB at boot. */
export const legacyKeys = { game: 'ancient-polis-save', inventory: 'ancient-polis-inventory', world: 'ancient-polis-world' } as const

export interface ChunkRecord { cells: Uint32Array; ids: Uint8Array }
export interface WorldRecord { version: 2 | 3; seed: number; size?: [number, number] }
/** The current world header. */
export const worldHeader = (seed: number): WorldRecord => ({ version: 3, seed, size: [SX, SZ] })

const cache = new Map<string, unknown>()
const pending = new Map<string, unknown>()
let db: IDBDatabase | null = null
let available = false
let timer: ReturnType<typeof setTimeout> | undefined
const statusListeners = new Set<(ok: boolean) => void>()

export const chunkKey = (chunk: number) => `chunk:${chunk}`

export function readRecord<T>(key: string): T | undefined { return cache.get(key) as T | undefined }

/** Every chunk record, keyed by chunk index. */
export function chunkRecords() {
  const result = new Map<number, ChunkRecord>()
  for (const [key, value] of cache) if (key.startsWith('chunk:')) result.set(Number(key.slice(6)), value as ChunkRecord)
  return result
}

/** Queues a record (undefined deletes it); writes are flushed together shortly after. */
export function writeRecord(key: string, value: unknown, delay = 300) {
  if (value === undefined) cache.delete(key)
  else cache.set(key, value)
  // In a room the room server keeps the game; this browser's own save is left untouched.
  if (room) return
  pending.set(key, value)
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), delay)
}

export function saveAvailable() { return available || room }

let room = false
/** True while playing in a shared room (Phase 12). */
export const inRoom = () => room

/**
 * Plays from a room instead of this browser's save: the room's world, shared game and this
 * player's inventory replace the local records in memory, and nothing is written to the browser's
 * save until the page is loaded again outside the room. Device settings stay this browser's own.
 */
export function enterRoomRecords(records: Map<string, unknown>) {
  room = true
  pending.clear()
  clearTimeout(timer)
  const settings = (cache.get('game') as { settings?: unknown } | undefined)?.settings
  for (const key of [...cache.keys()]) if (key.startsWith('chunk:') || key === 'world' || key === 'inventory' || key === 'game') cache.delete(key)
  for (const [key, value] of records) cache.set(key, value)
  const game = cache.get('game') as Record<string, unknown> | undefined
  if (game) cache.set('game', { ...game, settings: settings ?? {} })
}

export function onSaveStatus(listener: (ok: boolean) => void) {
  statusListeners.add(listener)
  return () => { statusListeners.delete(listener) }
}

function report(ok: boolean) { for (const listener of statusListeners) listener(ok) }

/** Writes every queued record now. Resolves once the transaction has committed. */
export function flush(): Promise<void> {
  clearTimeout(timer)
  if (!pending.size) return Promise.resolve()
  const entries = [...pending]
  pending.clear()
  if (!db) { report(false); return Promise.resolve() }
  return new Promise((resolve) => {
    try {
      const tx = db!.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const [key, value] of entries) {
        if (value === undefined) store.delete(key)
        else store.put(value, key)
      }
      tx.oncomplete = () => { report(true); resolve() }
      tx.onerror = tx.onabort = () => { report(false); resolve() }
    } catch {
      report(false)
      resolve()
    }
  })
}

/** Forgets every record (new game). */
export function clearSave() {
  for (const key of cache.keys()) pending.set(key, undefined)
  cache.clear()
  void flush()
}

const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('blocked'))
  })
}

/** Turns version 1 LocalStorage saves into version 2 records. Returns null when there are none. */
export function fromLegacy(getItem: (key: string) => string | null, chunkOf: (cell: number) => number, seed: number) {
  const parse = (key: string) => {
    try { const raw = getItem(key); return raw ? JSON.parse(raw) as unknown : undefined } catch { return undefined }
  }
  const game = parse(legacyKeys.game), inventory = parse(legacyKeys.inventory), world = parse(legacyKeys.world) as { edits?: unknown } | undefined
  if (game === undefined && inventory === undefined && world === undefined) return null
  const records = new Map<string, unknown>()
  if (game !== undefined) records.set('game', game)
  if (inventory !== undefined) records.set('inventory', inventory)
  records.set('world', { version: 2, seed } satisfies WorldRecord)
  const edits = Array.isArray(world?.edits) ? world.edits as unknown[] : []
  const byChunk = new Map<number, [number[], number[]]>()
  for (let i = 0; i + 1 < edits.length; i += 2) {
    const cell = edits[i], id = edits[i + 1]
    if (!Number.isInteger(cell) || !Number.isInteger(id) || (cell as number) < 0 || (id as number) < 0 || (id as number) > 255) continue
    const chunk = chunkOf(cell as number)
    if (!byChunk.has(chunk)) byChunk.set(chunk, [[], []])
    byChunk.get(chunk)![0].push(cell as number)
    byChunk.get(chunk)![1].push(id as number)
  }
  for (const [chunk, [cells, ids]] of byChunk) records.set(chunkKey(chunk), { cells: Uint32Array.from(cells), ids: Uint8Array.from(ids) } satisfies ChunkRecord)
  return records
}

/** Chunk of a grid index on the old 144 × 144 grid, where version 1 and 2 saves were made. */
export const oldChunkOf = (cell: number) => Math.floor(Math.floor(cell / OLD_SX) % OLD_SZ / 16) * (OLD_SX / 16) + Math.floor(cell % OLD_SX / 16)

/** Moves a grid index of the old 144 × 144 grid onto the current grid, which keeps the island centred. */
export function fromOldCell(cell: number) {
  const x = cell % OLD_SX, z = Math.floor(cell / OLD_SX) % OLD_SZ, y = Math.floor(cell / (OLD_SX * OLD_SZ))
  if (y >= SY) return -1
  return index(x + (SX - OLD_SX) / 2, y, z + (SZ - OLD_SZ) / 2)
}

/**
 * Version 2 → 3: the grid grew around the same centre, so every saved cell index (world edits and
 * kilns) moves by the same offset and the edits are regrouped into the new chunks. Returns the
 * records to write; nothing changes for a version 3 save or an empty one.
 */
export function upgradeRecords(records: Map<string, unknown>, seed: number) {
  const header = records.get('world') as WorldRecord | undefined
  const changes = new Map<string, unknown>()
  if (header?.version === 3) return changes
  const hasChunks = [...records.keys()].some((key) => key.startsWith('chunk:'))
  if (!header && !hasChunks) return changes
  const byChunk = new Map<number, [number[], number[]]>()
  for (const [key, value] of records) {
    if (!key.startsWith('chunk:')) continue
    changes.set(key, undefined)
    const { cells, ids } = (value ?? {}) as Partial<ChunkRecord>
    if (!(cells instanceof Uint32Array) || !(ids instanceof Uint8Array) || cells.length !== ids.length) continue
    for (let i = 0; i < cells.length; i++) {
      const cell = fromOldCell(cells[i])
      if (cell < 0) continue
      const chunk = chunkOfCell(cell)
      if (!byChunk.has(chunk)) byChunk.set(chunk, [[], []])
      byChunk.get(chunk)![0].push(cell)
      byChunk.get(chunk)![1].push(ids[i])
    }
  }
  for (const [chunk, [cells, ids]] of byChunk) changes.set(chunkKey(chunk), { cells: Uint32Array.from(cells), ids: Uint8Array.from(ids) } satisfies ChunkRecord)
  const inventory = records.get('inventory') as { kilns?: Record<string, unknown> } | undefined
  if (inventory?.kilns) {
    const kilns = Object.fromEntries(Object.entries(inventory.kilns).flatMap(([cell, kiln]) =>
      /^\d+$/.test(cell) && fromOldCell(Number(cell)) >= 0 ? [[String(fromOldCell(Number(cell))), kiln]] : []))
    changes.set('inventory', { ...inventory, kilns })
  }
  changes.set('world', worldHeader(seed))
  return changes
}

/**
 * Opens the save and reads it into memory. Old LocalStorage saves win over IndexedDB (they only
 * exist when they have not been moved yet), and are removed once the move has committed.
 */
export async function openSave(options: { chunkOf: (cell: number) => number; seed: number }) {
  cache.clear()
  pending.clear()
  const legacy = fromLegacy((key) => { try { return globalThis.localStorage?.getItem(key) ?? null } catch { return null } }, options.chunkOf, options.seed)
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no IndexedDB')
    db = await openDatabase()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    if (legacy) {
      store.clear()
      for (const [key, value] of legacy) store.put(value, key)
    }
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error) })
    keys.forEach((key, i) => cache.set(String(key), values[i]))
    if (legacy) {
      try { for (const key of Object.values(legacyKeys)) globalThis.localStorage?.removeItem(key) } catch { /* optional */ }
    }
    available = true
    for (const [key, value] of upgradeRecords(cache, options.seed)) writeRecord(key, value, 0)
    // Write what is queued before the tab goes away.
    globalThis.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush() })
    globalThis.addEventListener?.('pagehide', () => void flush())
  } catch {
    // Play on from the old save in memory; the LocalStorage copy stays for the next visit.
    db = null
    available = false
    cache.clear()
    if (legacy) for (const [key, value] of legacy) cache.set(key, value)
    for (const [key, value] of upgradeRecords(cache, options.seed)) {
      if (value === undefined) cache.delete(key)
      else cache.set(key, value)
    }
  }
}
