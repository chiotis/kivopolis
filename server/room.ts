import { VoxelWorld } from '../src/voxel/world'
import { Block, isKnownBlock, isFlowing } from '../src/voxel/blocks'
import { S, inside, wx, wy, wz } from '../src/voxel/grid'
import { cells } from '../src/game/blueprints/theatre'
import { initialShared, type Shared } from '../src/game/shared'
import { SEED } from '../src/voxel/generate'
import { DAY_SECONDS } from '../src/game/daylight'
import { MAX_PLAYERS, type ClientMessage, type PlayerInfo, type Pose, type RoomError, type ServerMessage, type WorldAction } from '../src/net/protocol'

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
}

interface Member { info: PlayerInfo; send: (message: ServerMessage) => void; pose: Pose | null }

/** How far from a player a block change may be: the game's reach plus room for lag. */
const REACH = 9
/** Shared fields a player may change, and which of them only the room's creator may change. */
const SHARED_KEYS = new Set<keyof Shared>(['started', 'discovered', 'completed', 'celebrated', 'buildings', 'facts', 'creative'])
const HOST_ONLY = new Set<keyof Shared>(['creative'])
const missions = new Set(cells.map((cell) => cell.mission))

const isInt = (value: unknown): value is number => Number.isInteger(value)

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
  private seq = 0
  private nextId = 1
  private clock = { water: 0, time: 0, poses: 0 }
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
  }

  get size() { return this.members.size }
  get names() { return [...this.members.values()].map((member) => member.info.name) }

  /** Adds a player; returns their id, or why they cannot join. */
  join(name: string, send: (message: ServerMessage) => void): { id: string } | { error: RoomError } {
    if (this.members.size >= MAX_PLAYERS) return { error: 'full' }
    if (this.names.includes(name)) return { error: 'name-taken' }
    const taken = new Set([...this.members.values()].map((member) => member.info.color))
    const color = [0, 1, 2, 3, 4].find((c) => !taken.has(c)) ?? 0
    const id = `p${this.nextId++}`
    const info: PlayerInfo = { id, name, color, host: name === this.host }
    const saved = this.players[name]
    send({
      type: 'welcome', code: this.code, you: info, seed: SEED, edits: [...this.world.edits], shared: this.shared,
      players: [...this.members.values()].map((member) => member.info),
      inventory: saved?.inventory ?? null, position: saved?.position ?? null,
    })
    this.broadcast({ type: 'joined', player: info })
    this.members.set(id, { info, send, pose: null })
    this.players[name] ??= { inventory: null, position: null }
    this.touch()
    return { id }
  }

  leave(id: string) {
    const member = this.members.get(id)
    if (!member) return
    this.members.delete(id)
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
      if (!member.info.host || !missions.has(action.mission as never)) return false
      let changed = false
      for (const cell of cells) {
        if (cell.mission !== action.mission || !cell.accept.includes(this.world.get(cell.x, cell.y, cell.z))) continue
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
      return this.world.set(x, y, z, Block.air)
    }
    if (action.type === 'set') {
      if (!isInt(action.block) || !isKnownBlock(action.block) || action.block === Block.bedrock || isFlowing(action.block)) return false
      return this.world.set(x, y, z, action.block)
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
      edits: [...this.world.edits], shared: this.shared, players: this.players,
    }
  }

  private broadcast(message: ServerMessage, except?: string) {
    for (const [id, member] of this.members) if (id !== except) member.send(message)
  }

  private touch() {
    this.dirty = true
    this.used = Date.now()
  }
}
