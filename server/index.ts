import { createServer } from 'node:http'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { Room, type SavedRoom } from './room'
import { cleanCode, cleanName, newCode, type ClientMessage, type RoomError, type ServerMessage } from '../src/net/protocol'

/**
 * The KivoPolis room server (Phase 12): rooms of up to five players building the same island.
 * Run behind nginx on its own subdomain with a certificate, so the game on Netlify connects with
 * wss://. See server/README.md for the CloudPanel set-up.
 *
 *   PORT              port to listen on (default 8787)
 *   DATA_DIR          where rooms are saved, one JSON file each (default ./rooms)
 *   ALLOWED_ORIGINS   comma-separated sites allowed to connect, e.g. https://kivopolis.netlify.app
 *                     (localhost is always allowed, for development)
 */
const PORT = Number(process.env.PORT ?? 8787)
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'rooms')
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
/** Rooms nobody has used for this long are deleted. */
const KEEP_DAYS = 60
const TICK = 0.05

const rooms = new Map<string, Room>()
const loading = new Map<string, Promise<Room | null>>()

const file = (code: string) => join(DATA_DIR, `${code}.json`)

export function originAllowed(origin: string | undefined, allowed: readonly string[] = ALLOWED) {
  if (!origin) return false
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return true
  return allowed.includes(origin)
}

async function loadRoom(code: string): Promise<Room | null> {
  const open = rooms.get(code)
  if (open) return open
  if (!loading.has(code)) {
    loading.set(code, (async () => {
      try {
        const saved = JSON.parse(await readFile(file(code), 'utf8')) as SavedRoom
        if (saved.version !== 1 || saved.code !== code) return null
        const room = new Room(code, saved.host, saved)
        rooms.set(code, room)
        return room
      } catch {
        return null
      } finally {
        loading.delete(code)
      }
    })())
  }
  return loading.get(code)!
}

async function saveRoom(room: Room) {
  room.dirty = false
  const target = file(room.code)
  // Write to a temporary file first, so a crash never leaves half a room on disk.
  await writeFile(`${target}.tmp`, JSON.stringify(room.save()))
  await rename(`${target}.tmp`, target)
}

async function newRoom(host: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = newCode()
    if (rooms.has(code) || await stat(file(code)).then(() => true, () => false)) continue
    const room = new Room(code, host)
    rooms.set(code, room)
    await saveRoom(room)
    return room
  }
  return null
}

function connect(socket: WebSocket) {
  const send = (message: ServerMessage) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)) }
  const refuse = (reason: RoomError) => { send({ type: 'error', reason }); socket.close() }
  let room: Room | null = null
  let id: string | null = null
  let budget = 60
  const refill = setInterval(() => { budget = 60 }, 1000)
  // A player has ten seconds to say which room they want.
  const timeout = setTimeout(() => { if (!room) socket.close() }, 10_000)

  socket.on('message', async (data) => {
    if (--budget < 0) return
    let message: ClientMessage
    try { message = JSON.parse(String(data)) } catch { return refuse('bad-message') }
    if (room && id) return room.handle(id, message)
    if (message.type !== 'create' && message.type !== 'join') return refuse('bad-message')
    const name = cleanName(message.name)
    if (!name) return refuse('bad-name')
    let target: Room | null
    if (message.type === 'create') target = await newRoom(name)
    else {
      const code = cleanCode(message.code)
      target = code ? await loadRoom(code) : null
      if (!target) return refuse('unknown-room')
    }
    if (!target) return refuse('unavailable')
    const result = target.join(name, send)
    if ('error' in result) return refuse(result.error)
    room = target
    id = result.id
    clearTimeout(timeout)
  })

  socket.on('close', () => {
    clearInterval(refill)
    clearTimeout(timeout)
    if (room && id) room.leave(id)
  })
}

export async function start(port = PORT) {
  await mkdir(DATA_DIR, { recursive: true })
  // Forget rooms nobody has used for two months.
  for (const name of await readdir(DATA_DIR)) {
    if (!name.endsWith('.json')) continue
    const info = await stat(join(DATA_DIR, name))
    if (Date.now() - info.mtimeMs > KEEP_DAYS * 86_400_000) await unlink(join(DATA_DIR, name)).catch(() => undefined)
  }

  const http = createServer((request, response) => {
    if (request.url === '/health') { response.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return }
    response.writeHead(404).end()
  })
  const sockets = new WebSocketServer({
    server: http,
    maxPayload: 256 * 1024,
    verifyClient: ({ origin }: { origin: string }) => originAllowed(origin),
  })
  const alive = new WeakSet<WebSocket>()
  sockets.on('connection', (socket) => {
    alive.add(socket)
    socket.on('pong', () => alive.add(socket))
    connect(socket)
  })
  // Drop connections that stopped answering, so their players leave the room.
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!alive.has(socket)) { socket.terminate(); continue }
      alive.delete(socket)
      socket.ping()
    }
  }, 30_000)

  let last = performance.now()
  const loop = setInterval(() => {
    const now = performance.now()
    const seconds = Math.min(0.5, (now - last) / 1000)
    last = now
    for (const room of rooms.values()) room.step(seconds)
  }, TICK * 1000)
  // Save changed rooms every five seconds, and let empty rooms go from memory once saved.
  const saver = setInterval(() => {
    for (const room of [...rooms.values()]) {
      const work = room.dirty ? saveRoom(room) : Promise.resolve()
      void work.then(() => { if (!room.size && !room.dirty) rooms.delete(room.code) }).catch((error) => console.error('save failed', room.code, error))
    }
  }, 5000)

  await new Promise<void>((resolve) => http.listen(port, resolve))
  const address = http.address()
  const listening = typeof address === 'object' && address ? address.port : port
  console.log(`KivoPolis rooms on port ${listening}, saving to ${DATA_DIR}`)
  return {
    port: listening,
    async close() {
      clearInterval(heartbeat); clearInterval(loop); clearInterval(saver)
      for (const room of rooms.values()) if (room.dirty) await saveRoom(room)
      rooms.clear()
      for (const socket of sockets.clients) socket.terminate()
      await new Promise<void>((resolve) => sockets.close(() => http.close(() => resolve())))
    },
  }
}

if (process.argv[1] && /server\/(index\.ts|dist\/index\.m?js)$/.test(process.argv[1].replace(/\\/g, '/'))) {
  void start().catch((error) => { console.error(error); process.exit(1) })
}
