import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import type { ServerMessage } from '../src/net/protocol'
import { Block } from '../src/voxel/blocks'
import { OX, OY, OZ, wx, wy, wz } from '../src/voxel/grid'

/**
 * Load check for the room server (Phase 12): ROOMS rooms of PLAYERS simulated players each. Every
 * player sends its position 12 times a second, as the game does, and places or breaks a block every
 * two seconds. The check reports how long the room takes to confirm a change, how many messages
 * flow, and (for a local server) memory and CPU.
 *
 *   npm run load-check                                       a local server on a free port
 *   LOAD_URL=wss://rooms.kivopolis.com LOAD_ORIGIN=https://kivopolis.netlify.app npm run load-check
 *
 *   ROOMS (10), PLAYERS (5), SECONDS (60)
 */
const ROOMS = Number(process.env.ROOMS ?? 10)
const PLAYERS = Number(process.env.PLAYERS ?? 5)
const SECONDS = Number(process.env.SECONDS ?? 60)
const ORIGIN = process.env.LOAD_ORIGIN ?? 'http://localhost:5173'

interface Bot { socket: WebSocket; sent: number; received: number; pending: Map<number, number>; trips: number[]; refused: number; errors: number }

const bots: Bot[] = []

function connect(url: string, hello: object) {
  return new Promise<{ bot: Bot; code: string }>((resolve, reject) => {
    const socket = new WebSocket(url, { origin: ORIGIN })
    const bot: Bot = { socket, sent: 0, received: 0, pending: new Map(), trips: [], refused: 0, errors: 0 }
    let me = ''
    socket.on('error', reject)
    socket.on('open', () => { socket.send(JSON.stringify(hello)); bot.sent++ })
    socket.on('message', (data) => {
      bot.received++
      const message = JSON.parse(String(data)) as ServerMessage
      if (message.type === 'welcome') { me = message.you.id; resolve({ bot, code: message.code }) }
      else if (message.type === 'error') reject(new Error(message.reason))
      else if (message.type === 'applied' && message.from === me) {
        const at = bot.pending.get(message.ref)
        if (at !== undefined) { bot.trips.push(performance.now() - at); bot.pending.delete(message.ref) }
        if (!message.ok) bot.refused++
      }
    })
    socket.on('close', () => { if (!me) reject(new Error('closed before joining')) })
  })
}

/** Keeps a bot busy: walking on the spot near the theatre and building a little pillar. */
function play(bot: Bot, slot: number) {
  const send = (message: object) => { if (bot.socket.readyState === bot.socket.OPEN) { bot.socket.send(JSON.stringify(message)); bot.sent++ } }
  const bx = OX + 4 + slot * 3, bz = OZ + 20, by = OY + 12
  const p: [number, number, number] = [wx(bx), wy(by), wz(bz) + 1.5]
  let ref = 0, step = 0
  const moving = setInterval(() => {
    step++
    send({ type: 'move', p: [p[0] + Math.sin(step / 10) * 0.3, p[1], p[2]], yaw: step / 20, item: 'limestone' })
  }, 1000 / 12)
  const building = setInterval(() => {
    ref++
    bot.pending.set(ref, performance.now())
    const placing = ref % 2 === 1
    send({ type: 'action', ref, action: placing ? { type: 'set', x: bx, y: by, z: bz, block: Block.limestone } : { type: 'break', x: bx, y: by, z: bz } })
  }, 2000)
  return () => { clearInterval(moving); clearInterval(building) }
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
}

async function main() {
  let url = process.env.LOAD_URL
  let stop: (() => Promise<void>) | null = null
  if (!url) {
    const dir = await mkdtemp(join(tmpdir(), 'kivopolis-load-'))
    process.env.DATA_DIR = dir
    const { start } = await import('./index')
    const server = await start(0)
    url = `ws://localhost:${server.port}`
    stop = async () => { await server.close(); await rm(dir, { recursive: true, force: true }) }
  }
  console.log(`${ROOMS} rooms × ${PLAYERS} players for ${SECONDS} s on ${url}`)

  const started = performance.now()
  const stops: (() => void)[] = []
  for (let r = 0; r < ROOMS; r++) {
    const host = await connect(url, { type: 'create', name: `Load ${r}` })
    bots.push(host.bot)
    stops.push(play(host.bot, 0))
    for (let p = 1; p < PLAYERS; p++) {
      const guest = await connect(url, { type: 'join', code: host.code, name: `Load ${r}-${p}` })
      bots.push(guest.bot)
      stops.push(play(guest.bot, p))
    }
  }
  const joined = performance.now() - started
  const cpu = process.cpuUsage()
  const begin = performance.now()
  await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000))
  const elapsed = (performance.now() - begin) / 1000
  const used = process.cpuUsage(cpu)
  for (const stopBot of stops) stopBot()
  // Let the last confirmations arrive before counting what never came back.
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const trips = bots.flatMap((bot) => bot.trips)
  const lost = bots.reduce((sum, bot) => sum + bot.pending.size, 0)
  const sent = bots.reduce((sum, bot) => sum + bot.sent, 0)
  const received = bots.reduce((sum, bot) => sum + bot.received, 0)
  const refused = bots.reduce((sum, bot) => sum + bot.refused, 0)
  const memory = process.memoryUsage()
  const report = {
    players: bots.length,
    joinSeconds: +(joined / 1000).toFixed(2),
    changes: trips.length,
    confirmMs: { p50: +percentile(trips, 0.5).toFixed(1), p95: +percentile(trips, 0.95).toFixed(1), max: +Math.max(...trips).toFixed(1) },
    unconfirmed: lost,
    refused,
    messagesPerSecond: { toServer: Math.round(sent / elapsed), fromServer: Math.round(received / elapsed) },
    ...(stop ? {
      // The server runs in this process when no LOAD_URL is given, so this is the server plus the bots.
      localProcess: { cpuPercent: +((used.user + used.system) / 1e4 / elapsed).toFixed(1), heapMB: Math.round(memory.heapUsed / 2 ** 20), rssMB: Math.round(memory.rss / 2 ** 20) },
    } : {}),
  }
  console.log(JSON.stringify(report, null, 2))
  for (const bot of bots) bot.socket.close()
  await stop?.()
  const ok = lost === 0 && refused === 0 && percentile(trips, 0.95) < 250
  console.log(ok ? 'PASS: every change confirmed, 95% within 250 ms' : 'FAIL: see the numbers above')
  process.exit(ok ? 0 : 1)
}

void main().catch((error) => { console.error(error); process.exit(1) })
