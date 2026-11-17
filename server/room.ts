import { VoxelWorld } from '../src/voxel/world'
import { Block, blocks, isKnownBlock, isFlowing } from '../src/voxel/blocks'
import { S, SX, SZ, index, inside, wx, wy, wz } from '../src/voxel/grid'
import { cellsOfStep, isStep } from '../src/game/plans'
import { initialShared, type Shared } from '../src/game/shared'
import { SEED } from '../src/voxel/generate'
import { DAY_SECONDS, isNight } from '../src/game/daylight'
import { emptyKiln, kilnContents, stepKiln, validKiln, validStack, type Kiln } from '../src/game/kiln'
import type { Stack } from '../src/game/items'
import { addDrop, randomVelocity, stepDrop, type DropEntity } from '../src/world/dropState'
import { spawnAnimals, stepAnimals, strikeGives, tendGives, type Animal } from '../src/world/wildlife'
import type { AnimalPose } from '../src/world/herd'
import { randomUUID } from 'node:crypto'
import { KICK_MINUTES, MAX_PLAYERS, PHRASES, type ClientMessage, type PlayerInfo, type Pose, type RoomError, type ServerMessage, type WorldAction } from '../src/net/protocol'

type Vec3 = [number, number, number]

/** A room as it is saved on disk. */
export interface SavedRoom {
  version: 1
  code: string
  seed: number
  created: number
  used: number
  /** The player who created the room; they keep the creator's rights when they come back. */
  host: string
  edits: [number, number][]
  shared: Shared
  players: Record<string, { inventory: unknown[] | null; position: Vec3 | null }>
  /** The kilns' contents, by world cell index. */
  kilns?: Record<string, Kiln>
}

interface Member {
  info: PlayerInfo
  send: (message: ServerMessage) => void
  /** Closes this player's connection. */
  close: () => void
  pose: Pose | null
  /** Secret that lets this player take their place back after a dropped connection. */
  token: string
  /** When they last said a phrase or pointed, to keep a room from being flooded. */
  said: number
  pointed: number
}

/** How far from a player a block change may be: the game's reach plus room for lag. */
const REACH = 9
/** Shared fields a player may change, and which of them only the room's creator may change. */
const SHARED_KEYS = new Set<keyof Shared>(['started', 'discovered', 'completed', 'celebrated', 'buildings', 'facts', 'creative'])
const HOST_ONLY = new Set<keyof Shared>(['creative'])

const isInt = (value: unknown): value is number => Number.isInteger(value)
const isVec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
/** How far from a dropped item a player may pick it up: the game's distance plus room for lag. */
const PICKUP = 3
const round = (value: number) => Math.round(value * 100) / 100

/** The cell of a kiln key (its world cell index), when it is one. */
function cellOf(key: unknown): Vec3 | null {
  if (typeof key !== 'string' || !/^\d{1,9}$/.test(key)) return null
  const i = Number(key)
  const cell: Vec3 = [i % SX, Math.floor(i / SX) % SZ, Math.floor(i / (SX * SZ))]
  const [x, z, y] = cell
  return inside(x, y, z) && index(x, y, z) === i ? [x, y, z] : null
}

/**
 * One shared game: the world (the generated island plus everyone's changes), the shared progress,
 * up to five players, the water and the clock. It knows nothing about sockets: it takes messages
 * and hands back what to send, so it can be tested on its own.
 */
export class Room {
  readonly world = new VoxelWorld()
  readonly code: string
  readonly host: string
  readonly created: number
  shared: Shared
  /** Saved inventory and position of everyone who has played here, by nickname. */
  players: SavedRoom['players']
  private members = new Map<string, Member>()
  /** Players the creator removed, by nickname, and until when they may not rejoin. */
  private kicked = new Map<string, number>()
  private seq = 0
  private nextId = 1
  private clock = { water: 0, time: 0, poses: 0, herd: 0, kilns: 0 }
  /** The items lying in the world, the animals and the kilns: the room runs them for everyone. */
  readonly drops: DropEntity[] = []
  private nextDrop = 1
  readonly animals: Animal[]
  readonly kilns = new Map<string, Kiln>()
  /** Who is using each kiln: one player at a time, who sends its contents while they do. */
  private kilnUser = new Map<string, string>()
  /** Something changed since the room was last saved. */
  dirty = false
  used = Date.now()

  constructor(code: string, host: string, saved?: SavedRoom) {
    this.code = code
    this.host = saved?.host ?? host
    this.created = saved?.created ?? Date.now()
    this.shared = saved ? { ...initialShared(), ...saved.shared } : { ...initialShared(), started: true }
    this.players = saved?.players ?? {}
    if (saved?.edits.length) this.world.regenerate(saved.edits)
    for (const [key, kiln] of Object.entries(saved?.kilns ?? {})) if (cellOf(key)) this.kilns.set(key, validKiln(kiln))
    this.animals = spawnAnimals(this.world)
  }

  get size() { return this.members.size }
  get names() { return [...this.members.values()].map((member) => member.info.name) }

  /**
   * Adds a player; returns their id, or why they cannot join. A player whose connection dropped
   * comes back with their token and takes over their old place, even before the old connection
   * has timed out.
   */
  join(name: string, send: (message: ServerMessage) => void, close: () => void = () => undefined, token?: string): { id: string } | { error: RoomError } {
    if ((this.kicked.get(name) ?? 0) > Date.now()) return { error: 'kicked' }
    const [oldId, old] = [...this.members].find(([, member]) => member.info.name === name) ?? []
    if (old && oldId) {
      if (!token || token !== old.token) return { error: 'name-taken' }
      this.members.delete(oldId)
      this.letKilnsGo(oldId)
      old.close()
      this.broadcast({ type: 'left', id: oldId })
    }
    if (this.members.size >= MAX_PLAYERS) return { error: 'full' }
    const taken = new Set([...this.members.values()].map((member) => member.info.color))
    const color = [0, 1, 2, 3, 4].find((c) => !taken.has(c)) ?? 0
    const id = `p${this.nextId++}`
    const info: PlayerInfo = { id, name, color, host: name === this.host }
    const saved = this.players[name]
    const secret = randomUUID()
    send({
      type: 'welcome', code: this.code, you: info, seed: SEED, edits: [...this.world.edits], shared: this.shared,
      players: [...this.members.values()].map((member) => member.info),
      inventory: saved?.inventory ?? null, position: saved?.position ?? null, token: secret,
      drops: this.drops, animals: this.animals,
    })
    this.broadcast({ type: 'joined', player: info })
    this.members.set(id, { info, send, close, pose: old?.pose ?? null, token: secret, said: 0, pointed: 0 })
    this.players[name] ??= { inventory: null, position: null }
    this.touch()
    return { id }
  }

  leave(id: string) {
    const member = this.members.get(id)
    if (!member) return
    this.members.delete(id)
    this.letKilnsGo(id)
    if (member.pose) this.players[member.info.name] = { ...this.players[member.info.name], position: member.pose.p }
    this.broadcast({ type: 'left', id })
    this.touch()
  }

  /** Handles one message from a player in the room. */
  handle(id: string, message: ClientMessage) {
    const member = this.members.get(id)
    if (!member) return
    switch (message.type) {
      case 'action': {
        const ok = this.apply(member, message.action)
        this.seq++
        // Everyone hears about a change in the same order; the sender learns whether it held.
        this.broadcast({ type: 'applied', seq: this.seq, from: id, ref: isInt(message.ref) ? message.ref : 0, ok, action: message.action })
        if (ok) this.touch()
        return
      }
      case 'shared': {
        const patch: Partial<Shared> = {}
        for (const [key, value] of Object.entries(message.patch ?? {}) as [keyof Shared, unknown][]) {
          if (!SHARED_KEYS.has(key) || (HOST_ONLY.has(key) && !member.info.host)) continue
          // Each field keeps its kind: booleans stay booleans, lists stay lists, objects stay objects.
          const expected = initialShared()[key]
          if (Array.isArray(expected) ? !Array.isArray(value) : typeof value !== typeof expected || value === null) continue
          ;(patch as Record<string, unknown>)[key] = value
        }
        if (!Object.keys(patch).length) return
        this.shared = { ...this.shared, ...patch }
        this.broadcast({ type: 'shared', patch, from: id }, id)
        this.touch()
        return
      }
      case 'move': {
        const { p, yaw, item } = message
        if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite) || !Number.isFinite(yaw)) return
        member.pose = { id, p: [p[0], p[1], p[2]], yaw, item: typeof item === 'string' ? item.slice(0, 32) : null }
        return
      }
      case 'say': {
        // One phrase every second and a half at most; only the room's own phrases, by number.
        const now = Date.now()
        if (!isInt(message.phrase) || message.phrase < 0 || message.phrase >= PHRASES.length || now - member.said < 1500) return
        member.said = now
        this.broadcast({ type: 'said', from: id, phrase: message.phrase })
        return
      }
      case 'point': {
        const now = Date.now()
        const cell = message.cell
        if (!Array.isArray(cell) || cell.length !== 3 || !cell.every(isInt) || !inside(cell[0], cell[1], cell[2]) || now - member.pointed < 1000) return
        member.pointed = now
        this.broadcast({ type: 'pointed', from: id, cell: [cell[0], cell[1], cell[2]] })
        return
      }
      case 'kick': {
        // Only the creator removes players; the removed player may not come back for a while.
        const target = this.members.get(message.id)
        if (!member.info.host || !target || message.id === id) return
        this.kicked.set(target.info.name, Date.now() + KICK_MINUTES * 60_000)
        target.send({ type: 'kicked' })
        this.members.delete(message.id)
        this.letKilnsGo(message.id)
        target.close()
        this.broadcast({ type: 'left', id: message.id })
        this.touch()
        return
      }
      case 'throw': {
        const stack = validStack(message.stack)
        const { from, velocity } = message
        if (!stack || !isVec(from) || !isVec(velocity) || !this.near(member, from, REACH)) return
        if (Math.hypot(...velocity) > 20 || !Number.isFinite(message.delay)) return
        this.spawn(stack, from, velocity, Math.min(5, Math.max(0, message.delay)))
        return
      }
      case 'pickup': {
        const drop = this.drops.find((item) => item.id === message.drop)
        if (!drop || !isInt(message.count) || message.count < 1 || drop.age < drop.delay - 0.3) return
        if (!this.near(member, [drop.x, drop.y - 0.7, drop.z], PICKUP)) return
        const count = Math.min(message.count, drop.stack.count)
        drop.stack.count -= count
        member.send({ type: 'gave', stack: { ...drop.stack, count } })
        this.broadcast({ type: 'taken', id: drop.id, left: drop.stack.count })
        if (!drop.stack.count) this.drops.splice(this.drops.indexOf(drop), 1)
        return
      }
      case 'animal': {
        const animal = this.animals.find((item) => item.id === message.animal)
        if (!animal || !member.pose || !this.near(member, [animal.x, animal.y, animal.z], REACH)) return
        if (message.act === 'strike') {
          const gives = strikeGives(animal, member.pose.p[0], member.pose.p[2])
          if (gives) this.spawn(gives, [animal.x, animal.y + 0.6, animal.z], [0, gives.item === 'wool' ? 2.4 : 2, 0], 0.4)
        } else if (message.act === 'tend') {
          const milk = tendGives(animal)
          if (milk) member.send({ type: 'gave', stack: milk })
        }
        this.clock.herd = Infinity
        return
      }
      case 'kilnOpen': {
        const cell = cellOf(message.cell)
        if (!cell || this.world.get(...cell) !== Block.kiln) return
        const user = this.kilnUser.get(message.cell)
        if (user && user !== id && this.members.has(user)) { member.send({ type: 'kilnBusy', cell: message.cell }); return }
        this.kilnUser.set(message.cell, id)
        const kiln = this.kilns.get(message.cell) ?? emptyKiln()
        this.kilns.set(message.cell, kiln)
        member.send({ type: 'kiln', cell: message.cell, kiln })
        return
      }
      case 'kilnSet': {
        if (this.kilnUser.get(message.cell) !== id || !this.kilns.has(message.cell)) return
        this.kilns.set(message.cell, validKiln(message.kiln))
        this.touch()
        return
      }
      case 'kilnClose': {
        if (this.kilnUser.get(message.cell) === id) this.kilnUser.delete(message.cell)
        return
      }
      case 'inventory': {
        if (!Array.isArray(message.slots) || message.slots.length > 64) return
        this.players[member.info.name] = { ...this.players[member.info.name], inventory: message.slots }
        this.touch()
        return
      }
    }
  }

  /** Checks a change and applies it to the room's world. False when it is refused or changes nothing. */
  private apply(member: Member, action: WorldAction): boolean {
    if (!action || typeof action !== 'object') return false
    if (action.type === 'restart') {
      if (!member.info.host || !isStep(action.mission)) return false
      let changed = false
      for (const cell of cellsOfStep(action.mission)) {
        if (!cell.accept.includes(this.world.get(cell.x, cell.y, cell.z))) continue
        changed = this.world.set(cell.x, cell.y, cell.z, Block.air) || changed
      }
      return changed
    }
    const { x, y, z } = action
    if (!isInt(x) || !isInt(y) || !isInt(z) || !inside(x, y, z) || y <= 0) return false
    if (member.pose) {
      const [px, py, pz] = member.pose.p
      if (Math.hypot(wx(x) + S / 2 - px, wy(y) + S / 2 - py, wz(z) + S / 2 - pz) > REACH) return false
    }
    if (action.type === 'break') {
      const id = this.world.get(x, y, z)
      if (id === Block.air || id === Block.bedrock || id === Block.water || isFlowing(id)) return false
      if (!this.world.set(x, y, z, Block.air)) return false
      const at: Vec3 = [wx(x) + S / 2, wy(y) + S / 2, wz(z) + S / 2]
      // What the block gives: at most what this kind of block can give.
      const def = blocks[id]
      const most = def.drop === undefined ? { item: def.key, count: 1 } : def.drop
      const given = validStack(action.drop)
      if (given && most && given.item === most.item && given.count <= most.count) this.spawn(given, at)
      if (id === Block.kiln) this.breakKiln(String(index(x, y, z)), at)
      return true
    }
    if (action.type === 'set') {
      if (!isInt(action.block) || !isKnownBlock(action.block) || action.block === Block.bedrock || isFlowing(action.block)) return false
      const before = this.world.get(x, y, z)
      if (!this.world.set(x, y, z, action.block)) return false
      if (before === Block.kiln) this.breakKiln(String(index(x, y, z)), [wx(x) + S / 2, wy(y) + S / 2, wz(z) + S / 2])
      return true
    }
    return false
  }

  /**
   * Runs the room for `seconds`: the water, the shared clock (sent every 5 seconds) and the
   * players' positions (sent ten times a second).
   */
  step(seconds: number) {
    if (!this.members.size) return
    this.clock.water += seconds
    while (this.clock.water >= 0.25) {
      this.clock.water -= 0.25
      if (this.world.tickWater()) this.dirty = true
    }
    this.shared = { ...this.shared, time: (this.shared.time + seconds / DAY_SECONDS) % 1 }
    this.clock.time += seconds
    if (this.clock.time >= 5) {
      this.clock.time = 0
      this.broadcast({ type: 'time', time: this.shared.time })
    }
    // Dropped items fall and settle; the game moves them the same way, so only new and taken ones are sent.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (!stepDrop(this.drops[i], seconds, this.world)) this.drops.splice(i, 1)
    }
    const night = isNight(this.shared.time)
    stepAnimals(this.animals, seconds, { world: this.world, night }, (x, y, z) => this.spawn({ item: 'feather', count: 1 }, [x, y, z]))
    this.clock.herd += seconds
    if (this.clock.herd >= 0.2) {
      this.clock.herd = 0
      this.broadcast({ type: 'herd', animals: this.animals.map((a): AnimalPose => [a.id, round(a.x), round(a.y), round(a.z), round(a.yaw), a.walking ? 1 : 0, round(a.sheared), round(a.hurt)]) })
    }
    // Kilns nobody is using burn here; the one a player has open burns in their game.
    this.clock.kilns += seconds
    if (this.clock.kilns >= 0.2) {
      for (const [key, kiln] of this.kilns) {
        if (this.kilnUser.has(key)) continue
        const next = stepKiln(kiln, this.clock.kilns)
        if (next !== kiln) { this.kilns.set(key, next); this.dirty = true }
      }
      this.clock.kilns = 0
    }
    this.clock.poses += seconds
    if (this.clock.poses >= 0.1) {
      this.clock.poses = 0
      const poses = [...this.members.values()].flatMap((member) => member.pose ? [member.pose] : [])
      if (poses.length) this.broadcast({ type: 'poses', poses })
    }
  }

  /** The room as it is saved. Players still in the room are saved where they stand. */
  save(): SavedRoom {
    for (const member of this.members.values()) {
      if (member.pose) this.players[member.info.name] = { ...this.players[member.info.name], position: member.pose.p }
    }
    return {
      version: 1, code: this.code, seed: SEED, created: this.created, used: this.used, host: this.host,
      edits: [...this.world.edits], shared: this.shared, players: this.players, kilns: Object.fromEntries(this.kilns),
    }
  }

  /** Drops items into the world for everyone. */
  private spawn(stack: Stack, [x, y, z]: Vec3, velocity: Vec3 = randomVelocity(), delay = 0.35) {
    const drop: DropEntity = { id: this.nextDrop++, stack: { ...stack }, x, y, z, vx: velocity[0], vy: velocity[1], vz: velocity[2], age: 0, delay }
    const gone = addDrop(this.drops, drop)
    if (gone) this.broadcast({ type: 'taken', id: gone.id, left: 0 })
    this.broadcast({ type: 'dropped', drop })
  }

  /** A broken kiln spills what it held; whoever was using it is told. */
  private breakKiln(key: string, at: Vec3) {
    const kiln = this.kilns.get(key)
    const user = this.kilnUser.get(key)
    this.kilns.delete(key)
    this.kilnUser.delete(key)
    if (user) this.members.get(user)?.send({ type: 'kilnGone', cell: key })
    if (kiln) for (const stack of kilnContents(kiln)) this.spawn(stack, at)
  }

  private letKilnsGo(id: string) {
    for (const [key, user] of this.kilnUser) if (user === id) this.kilnUser.delete(key)
  }

  /** Whether a player stands within `reach` of a point (true before their first position arrives). */
  private near(member: Member, [x, y, z]: Vec3, reach: number) {
    if (!member.pose) return true
    const [px, py, pz] = member.pose.p
    return Math.hypot(x - px, y - py, z - pz) <= reach
  }

  private broadcast(message: ServerMessage, except?: string) {
    for (const [id, member] of this.members) if (id !== except) member.send(message)
  }

  private touch() {
    this.dirty = true
    this.used = Date.now()
  }
}
