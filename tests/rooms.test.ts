import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, utimes, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { cleanCode, cleanName, type ServerMessage, type Welcome } from '../src/net/protocol'
import { Block } from '../src/voxel/blocks'
import { OX, OY, OZ, index, wx, wy, wz } from '../src/voxel/grid'
import { emptyKiln, stepKiln, type Kiln } from '../src/game/kiln'
import { spawnAnimals } from '../src/world/wildlife'
import { VoxelWorld } from '../src/voxel/world'

const dir = await mkdtemp(join(tmpdir(), 'kivopolis-rooms-'))
process.env.DATA_DIR = dir
const { start, originAllowed, forgetOldRooms } = await import('../server/index')

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

describe('the pieces the room runs', () => {
  it('burns a kiln the same way the game does', () => {
    let kiln: Kiln = { ...emptyKiln(), input: { item: 'clay', count: 1 }, fuel: { item: 'stick', count: 1 } }
    kiln = stepKiln(kiln, 0.2)
    expect(kiln.fuel).toBeNull()
    expect(kiln.burn).toBeGreaterThan(0)
    expect(stepKiln(emptyKiln(), 0.2)).toEqual(emptyKiln())
  })

  it('places the same animals with the same ids every time', () => {
    const world = new VoxelWorld()
    const first = spawnAnimals(world), second = spawnAnimals(world)
    expect(second.map((animal) => [animal.id, animal.kind, animal.x])).toEqual(first.map((animal) => [animal.id, animal.kind, animal.x]))
    expect(first[0].id).toBe(1)
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

  it('carries phrases and pointing, lets the creator remove a player, and lets a dropped player back in', async () => {
    const host = await player(server.port, { type: 'create', name: 'Δάσκαλος' })
    const welcome = await host.next('welcome')
    const room = welcome.code
    const kid = await player(server.port, { type: 'join', code: room, name: 'Μαρία' })
    const kidWelcome = await kid.next('welcome')
    expect(kidWelcome.token).toMatch(/[0-9a-f-]{36}/)

    // A phrase by its number reaches everyone; a second one straight after is dropped, and so is a made-up one.
    kid.send({ type: 'say', phrase: 1 })
    kid.send({ type: 'say', phrase: 2 })
    kid.send({ type: 'say', phrase: 99 })
    expect(await host.next('said')).toEqual({ type: 'said', from: kidWelcome.you.id, phrase: 1 })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(host.inbox.filter((m) => m.type === 'said')).toHaveLength(1)
    kid.send({ type: 'point', cell: [OX, OY, OZ] })
    expect((await host.next('pointed')).cell).toEqual([OX, OY, OZ])

    // The same name without the secret is refused; with it, the player takes their place back.
    const impostor = await player(server.port, { type: 'join', code: room, name: 'Μαρία' })
    expect((await impostor.next('error')).reason).toBe('name-taken')
    const back = await player(server.port, { type: 'join', code: room, name: 'Μαρία', token: kidWelcome.token })
    const backWelcome = await back.next('welcome')
    expect(backWelcome.you.name).toBe('Μαρία')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(kid.socket.readyState).toBe(WebSocket.CLOSED)

    // Only the creator removes players; the removed player cannot come straight back.
    back.send({ type: 'kick', id: welcome.you.id })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(host.socket.readyState).toBe(WebSocket.OPEN)
    host.send({ type: 'kick', id: backWelcome.you.id })
    expect((await back.next('kicked')).type).toBe('kicked')
    const again = await player(server.port, { type: 'join', code: room, name: 'Μαρία', token: backWelcome.token })
    expect((await again.next('error')).reason).toBe('kicked')
    host.socket.close()
  })

  it('runs the dropped items, the animals and the kilns for everyone', async () => {
    const a = await player(server.port, { type: 'create', name: 'Άρης' })
    const welcome = await a.next('welcome')
    const b = await player(server.port, { type: 'join', code: welcome.code, name: 'Δάφνη' })
    const welcomeB = await b.next('welcome')
    expect(welcomeB.animals.map((animal) => animal.id)).toEqual(welcome.animals.map((animal) => animal.id))
    expect((await b.next('herd')).animals).toHaveLength(welcome.animals.length)

    // Both stand on the theatre's floor; Aris breaks a block and the room drops what it gives.
    const floor = OY + 1
    const stand: [number, number, number] = [wx(OX), wy(floor + 1), wz(OZ)]
    a.send({ type: 'move', p: stand, yaw: 0, item: null })
    b.send({ type: 'move', p: stand, yaw: 0, item: null })
    await new Promise((resolve) => setTimeout(resolve, 60))
    a.send({ type: 'action', ref: 1, action: { type: 'set', x: OX + 2, y: floor + 1, z: OZ, block: Block.marble } })
    await a.next('applied')
    let from = b.inbox.length
    a.send({ type: 'action', ref: 2, action: { type: 'break', x: OX + 2, y: floor + 1, z: OZ, drop: { item: 'marble', count: 1 } } })
    const dropped = await b.next('dropped', from)
    expect(dropped.drop.stack).toEqual({ item: 'marble', count: 1 })
    // A block cannot give more, or something else, than it gives.
    a.send({ type: 'action', ref: 3, action: { type: 'set', x: OX + 2, y: floor + 1, z: OZ, block: Block.marble } })
    from = b.inbox.length
    a.send({ type: 'action', ref: 4, action: { type: 'break', x: OX + 2, y: floor + 1, z: OZ, drop: { item: 'bronzeIngot', count: 64 } } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(b.inbox.slice(from).some((m) => m.type === 'dropped')).toBe(false)

    // Daphne picks it up once it has settled: it goes to her, and is gone for Aris.
    await new Promise((resolve) => setTimeout(resolve, 500))
    from = a.inbox.length
    b.send({ type: 'pickup', drop: dropped.drop.id, count: 5 })
    expect((await b.next('gave')).stack).toEqual({ item: 'marble', count: 1 })
    expect(await a.next('taken', from)).toEqual({ type: 'taken', id: dropped.drop.id, left: 0 })

    // Throwing: near the player it lands for everyone; from across the island it is refused.
    from = b.inbox.length
    a.send({ type: 'throw', stack: { item: 'stick', count: 3 }, from: stand, velocity: [1, 1, 0], delay: 1.5 })
    a.send({ type: 'throw', stack: { item: 'stick', count: 3 }, from: [60, 5, 60], velocity: [1, 1, 0], delay: 1.5 })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(b.inbox.slice(from).filter((m) => m.type === 'dropped')).toHaveLength(1)

    // A goat gives milk to whoever tends it; a woolly sheep drops wool for everyone when hit.
    const goat = welcome.animals.find((animal) => animal.kind === 'goat')!
    const sheep = welcome.animals.find((animal) => animal.kind === 'sheep')!
    const at = async (animal: { id: number }) => {
      const pose = (await b.next('herd', b.inbox.length)).animals.find((item) => item[0] === animal.id)!
      a.send({ type: 'move', p: [pose[1], pose[2], pose[3] + 1], yaw: 0, item: null })
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    await at(goat)
    a.send({ type: 'animal', animal: goat.id, act: 'tend' })
    expect((await a.next('gave', a.inbox.length)).stack).toEqual({ item: 'milk', count: 1 })
    await at(sheep)
    from = b.inbox.length
    a.send({ type: 'animal', animal: sheep.id, act: 'strike' })
    expect((await b.next('dropped', from)).drop.stack.item).toBe('wool')

    // A kiln: one player uses it at a time; it keeps burning in the room once they close it.
    a.send({ type: 'move', p: stand, yaw: 0, item: null })
    await new Promise((resolve) => setTimeout(resolve, 40))
    a.send({ type: 'action', ref: 5, action: { type: 'set', x: OX + 2, y: floor + 1, z: OZ, block: Block.kiln } })
    await new Promise((resolve) => setTimeout(resolve, 60))
    const cell = String(index(OX + 2, floor + 1, OZ))
    a.send({ type: 'kilnOpen', cell })
    expect((await a.next('kiln')).kiln).toEqual(emptyKiln())
    b.send({ type: 'kilnOpen', cell })
    expect((await b.next('kilnBusy')).cell).toBe(cell)
    a.send({ type: 'kilnSet', cell, kiln: { ...emptyKiln(), input: { item: 'clay', count: 4 }, fuel: { item: 'stick', count: 2 } } })
    a.send({ type: 'kilnClose', cell })
    await new Promise((resolve) => setTimeout(resolve, 500))
    b.send({ type: 'kilnOpen', cell })
    const burning = (await b.next('kiln')).kiln
    expect(burning.burn).toBeGreaterThan(0)
    expect(burning.fuel).toEqual({ item: 'stick', count: 1 })

    // Breaking it spills what it holds, and tells whoever has it open.
    from = b.inbox.length
    a.send({ type: 'action', ref: 6, action: { type: 'break', x: OX + 2, y: floor + 1, z: OZ, drop: { item: 'kiln', count: 1 } } })
    expect((await b.next('kilnGone', from)).cell).toBe(cell)
    await new Promise((resolve) => setTimeout(resolve, 60))
    const spilled = b.inbox.slice(from).flatMap((m) => m.type === 'dropped' ? [m.drop.stack.item] : [])
    expect(spilled).toEqual(expect.arrayContaining(['kiln', 'clay', 'stick']))
    a.socket.close(); b.socket.close()
  })

  it('refuses connections from other sites', async () => {
    await expect(player(server.port, { type: 'create', name: 'X' }, 'https://elsewhere.example')).rejects.toBeTruthy()
  })
})

describe('cleaning up old rooms', () => {
  it('deletes rooms unused for 60 days, but keeps newer ones and rooms that are open', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'kivopolis-old-'))
    const old = (Date.now() - 61 * 86_400_000) / 1000
    for (const code of ['OLDAAA', 'OLDBBB', 'NEWCCC']) await writeFile(join(folder, `${code}.json`), '{}')
    await utimes(join(folder, 'OLDAAA.json'), old, old)
    await utimes(join(folder, 'OLDBBB.json'), old, old)
    expect(await forgetOldRooms(folder, Date.now(), new Set(['OLDBBB']))).toBe(1)
    expect((await readdir(folder)).sort()).toEqual(['NEWCCC.json', 'OLDBBB.json'])
    await rm(folder, { recursive: true, force: true })
  })
})
