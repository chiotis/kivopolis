import { chunkKey, enterRoomRecords, worldHeader, type ChunkRecord } from '../game/save'
import { chunkOfCell } from '../voxel/grid'
import { spawn } from '../game/theatre'
import type { Request, RoomError, ServerMessage, Welcome } from './protocol'

/**
 * Joining a room (Phase 12). The menu stores the request in this tab and reloads the page; at boot
 * the game connects before anything else loads, and plays from the room's snapshot instead of the
 * browser's own save. Leaving the room clears the request and reloads again.
 */

/** Address of the room server, set on Netlify as VITE_ROOM_SERVER. Without it, rooms are hidden. */
export const ROOM_SERVER: string = import.meta.env.VITE_ROOM_SERVER ?? ''

const REQUEST_KEY = 'kivopolis-room'
const ERROR_KEY = 'kivopolis-room-error'

const session = () => { try { return globalThis.sessionStorage ?? null } catch { return null } }

export function requestRoom(request: Request) {
  session()?.setItem(REQUEST_KEY, JSON.stringify(request))
  session()?.removeItem(ERROR_KEY)
  location.reload()
}

export function leaveRoom() {
  session()?.removeItem(REQUEST_KEY)
  location.reload()
}

function storedRequest(): Request | null {
  try { return JSON.parse(session()?.getItem(REQUEST_KEY) ?? 'null') as Request | null } catch { return null }
}

/** True when the last attempt to join a room failed, so the menu opens the room window to say why. */
export const hasRoomError = () => Boolean(session()?.getItem(ERROR_KEY))

/** Why the last attempt to join failed, once; the menu shows it. */
export function takeRoomError(): RoomError | null {
  const error = session()?.getItem(ERROR_KEY) as RoomError | null
  session()?.removeItem(ERROR_KEY)
  return error
}

/** The open connection and the room, while playing in one. */
export const connection: {
  socket: WebSocket | null
  welcome: Welcome | null
  /** Messages that arrived before the game was ready to handle them. */
  early: ServerMessage[]
  listener: ((message: ServerMessage) => void) | null
} = { socket: null, welcome: null, early: [], listener: null }

/** Connects and waits for the room's snapshot. Resolves with a welcome or why joining failed. */
function connect(request: Request): Promise<Welcome | RoomError> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: Welcome | RoomError) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } }
    const timer = setTimeout(() => { socket.close(); finish('unavailable') }, 10_000)
    let socket: WebSocket
    try { socket = new WebSocket(ROOM_SERVER) } catch { finish('unavailable'); return }
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(request.create ? { type: 'create', name: request.name } : { type: 'join', code: request.code, name: request.name }))
    })
    socket.addEventListener('message', (event) => {
      let message: ServerMessage
      try { message = JSON.parse(String(event.data)) as ServerMessage } catch { return }
      if (!settled) {
        if (message.type === 'welcome') { connection.socket = socket; connection.welcome = message; finish(message) }
        else if (message.type === 'error') finish(message.reason)
        return
      }
      if (connection.listener) connection.listener(message)
      else connection.early.push(message)
    })
    socket.addEventListener('close', () => {
      finish('unavailable')
      connection.listener?.({ type: 'error', reason: 'unavailable' })
    })
    socket.addEventListener('error', () => finish('unavailable'))
  })
}

/** Builds the save records of a room from its snapshot. */
export function roomRecords(welcome: Welcome) {
  const records = new Map<string, unknown>()
  records.set('world', worldHeader(welcome.seed))
  const byChunk = new Map<number, [number[], number[]]>()
  for (const [cell, id] of welcome.edits) {
    const chunk = chunkOfCell(cell)
    if (!byChunk.has(chunk)) byChunk.set(chunk, [[], []])
    byChunk.get(chunk)![0].push(cell)
    byChunk.get(chunk)![1].push(id)
  }
  for (const [chunk, [cells, ids]] of byChunk) records.set(chunkKey(chunk), { cells: Uint32Array.from(cells), ids: Uint8Array.from(ids) } satisfies ChunkRecord)
  records.set('inventory', { version: 1, slots: welcome.inventory ?? [], kilns: {} })
  records.set('game', { version: 3, shared: welcome.shared, player: { position: welcome.position ?? [...spawn] } })
  return records
}

/**
 * At boot: joins the requested room, if any. On success the game plays from the room; on failure
 * the request is dropped, the reason kept for the menu, and the game opens the browser's own save.
 */
export async function joinRequestedRoom() {
  const request = storedRequest()
  if (!request || !ROOM_SERVER) return false
  const result = await connect(request)
  if (typeof result === 'string') {
    session()?.removeItem(REQUEST_KEY)
    session()?.setItem(ERROR_KEY, result)
    return false
  }
  // A new room keeps its code for the next reload, so reloading rejoins the same room.
  if (request.create) session()?.setItem(REQUEST_KEY, JSON.stringify({ create: false, code: result.code, name: request.name } satisfies Request))
  enterRoomRecords(roomRecords(result))
  return true
}
