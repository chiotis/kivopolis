/**
 * Save version 2: one IndexedDB store holds the game, the inventory, the world header and one
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
export interface WorldRecord { version: 2; seed: number }

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
  pending.set(key, value)
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), delay)
}

export function saveAvailable() { return available }

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
    // Write what is queued before the tab goes away.
    globalThis.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush() })
    globalThis.addEventListener?.('pagehide', () => void flush())
  } catch {
    // Play on from the old save in memory; the LocalStorage copy stays for the next visit.
    db = null
    available = false
    cache.clear()
    if (legacy) for (const [key, value] of legacy) cache.set(key, value)
  }
}
