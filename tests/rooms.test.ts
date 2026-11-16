import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { cleanCode, cleanName, type ServerMessage, type Welcome } from '../src/net/protocol'
import { Block } from '../src/voxel/blocks'
import { OX, OY, OZ, index, wx, wy, wz } from '../src/voxel/grid'

const dir = await mkdtemp(join(tmpdir(), 'kivopolis-rooms-'))
process.env.DATA_DIR = dir
const { start, originAllowed } = await import('../server/index')

type Server = Awaited<ReturnType<typeof start>>
let server: Server

/** A test player: a socket that remembers every message it got. */
async function player(port: number, hello: object, origin = 'http://localhost:5173') {
  const socket = new WebSocket(`ws://localhost:${port}`, { origin })
  const inbox: ServerMessage[] = []
  socket.on('message', (data) => inbox.push(JSON.parse(String(data))))
  await new Promise<void>((resolve, reject) => { socket.on('open', () => resolve()); socket.on('error', reject) })
  socket.send(JSON.stringify(hello))
  const next = async <T extends ServerMessage['type']>(type: T, from = 0) => {
    for (let i = 0; i < 100; i++) {
      const found = inbox.slice(from).find((message) => message.type === type)
      if (found) return found as Extract<ServerMessage, { type: T }>
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`no ${type}`)
  }
  const send = (message: object) => socket.send(JSON.stringify(message))
  return { socket, inbox, next, send }
}

beforeAll(async () => { server = await start(0) })
afterAll(async () => { await server.close(); await rm(dir, { recursive: true, force: true }) })

describe('names and codes', () => {
  it('accepts short Greek and Latin nicknames and refuses the rest', () => {
    expect(cleanName('  Νίκη  ')).toBe('Νίκη')
    expect(cleanName('Alex 2')).toBe('Alex 2')
    expect(cleanName('')).toBeNull()
    expect(cleanName('a'.repeat(17))).toBeNull()
    expect(cleanName('<script>')).toBeNull()
    expect(cleanName('Μαλάκας')).toBeNull()
    expect(cleanCode(' abc234 ')).toBe('ABC234')
    expect(cleanCode('ABC10O')).toBeNull()
  })

  it('lets only the game and localhost connect', () => {
    expect(originAllowed('http://localhost:5173', [])).toBe(true)
    expect(originAllowed('https://kivopolis.netlify.app', ['https://kivopolis.netlify.app'])).toBe(true)
    expect(originAllowed('https://elsewhere.example', ['https://kivopolis.netlify.app'])).toBe(false)
    expect(originAllowed(undefined, [])).toBe(false)
  })
})

describe('a room', () => {
  let code = ''

  it('is created with a code, and its creator is the host', async () => {
    const a = await player(server.port, { type: 'create', name: 'Ελένη' })
    const welcome = await a.next('welcome')
    expect(cleanCode(welcome.code)).toBe(welcome.code)
    expect(welcome.you).toMatchObject({ name: 'Ελένη', host: true })
    expect(welcome.shared.started).toBe(true)
    expect(welcome.players).toEqual([])
    code = welcome.code
    a.socket.close()
  })

  it('relays every change to everyone, in one order, and refuses what is not allowed', async () => {
    const a = await player(server.port, { type: 'join', code, name: 'Ελένη' })
    const welcomeA = await a.next('welcome')
    const b = await player(server.port, { type: 'join', code: code.toLowerCase(), name: 'Νίκος' })
    const welcomeB = await b.next('welcome')
    expect(welcomeB.players.map((p) => p.name)).toEqual(['Ελένη'])
    expect(welcomeB.you.host).toBe(false)
    expect((await a.next('joined')).player.name).toBe('Νίκος')

    // Both stand by the theatre; Eleni places a marble block within reach.
    const near = [wx(OX), wy(OY + 2), wz(OZ)]
    a.send({ type: 'move', p: near, yaw: 0, item: 'marble' })
    b.send({ type: 'move', p: near, yaw: 0, item: null })
    await new Promise((resolve) => setTimeout(resolve, 60))
    a.send({ type: 'action', ref: 7, action: { type: 'set', x: OX, y: OY + 3, z: OZ, block: Block.marble } })
    const seen = await b.next('applied')
    expect(seen).toMatchObject({ from: welcomeA.you.id, ok: true, action: { type: 'set', block: Block.marble } })
    expect((await a.next('applied')).ref).toBe(7)
    // B sees A in the positions sent ten times a second.
    expect((await b.next('poses')).poses.map((pose) => pose.id)).toContain(welcomeA.you.id)

    // Out of reach, bedrock, and a restart by someone who is not the host are refused.
    const from = b.inbox.length
    b.send({ type: 'action', ref: 1, action: { type: 'set', x: OX + 60, y: OY + 3, z: OZ, block: Block.marble } })
    b.send({ type: 'action', ref: 2, action: { type: 'set', x: OX, y: OY + 4, z: OZ, block: Block.bedrock } })
    b.send({ type: 'action', ref: 3, action: { type: 'restart', mission: 'orchestra' } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const answers = b.inbox.slice(from).filter((m): m is Extract<ServerMessage, { type: 'applied' }> => m.type === 'applied')
    expect(answers.map((m) => [m.ref, m.ok])).toEqual([[1, false], [2, false], [3, false]])
    expect(answers.map((m) => m.seq)).toEqual([...answers.map((m) => m.seq)].sort((x, y) => x - y))

    // Shared progress goes to the others; only the host may switch creative play.
    b.send({ type: 'shared', patch: { discovered: true, creative: true } })
    const shared = await a.next('shared')
    expect(shared.patch).toEqual({ discovered: true })

    // The same nickname cannot join twice.
    const twin = await player(server.port, { type: 'join', code, name: 'Νίκος' })
    expect((await twin.next('error')).reason).toBe('name-taken')
    a.socket.close(); b.socket.close()
  })

  it('takes five players at most and refuses unknown rooms and bad names', async () => {
    const players = []
    for (const name of ['A1', 'A2', 'A3', 'A4', 'A5']) {
      const p = await player(server.port, { type: 'join', code, name })
      await p.next('welcome')
      players.push(p)
    }
    const sixth = await player(server.port, { type: 'join', code, name: 'A6' })
    expect((await sixth.next('error')).reason).toBe('full')
    const lost = await player(server.port, { type: 'join', code: 'ZZZZZZ', name: 'A7' })
    expect((await lost.next('error')).reason).toBe('unknown-room')
    const rude = await player(server.port, { type: 'create', name: '' })
    expect((await rude.next('error')).reason).toBe('bad-name')
    for (const p of players) p.socket.close()
  })

  it('is saved to disk and comes back with its blocks after a restart', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    await server.close()
    server = await start(0)
    const back = await player(server.port, { type: 'join', code, name: 'Ελένη' })
    const welcome: Welcome = await back.next('welcome')
    expect(welcome.edits).toContainEqual([index(OX, OY + 3, OZ), Block.marble])
    expect(welcome.shared.discovered).toBe(true)
    expect(welcome.you.host).toBe(true)
    back.socket.close()
  })

  it('refuses connections from other sites', async () => {
    await expect(player(server.port, { type: 'create', name: 'X' }, 'https://elsewhere.example')).rejects.toBeTruthy()
  })
})
