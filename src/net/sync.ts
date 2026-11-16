import { connection, leaveRoomWith, reconnect } from './client'
import { bubbles, markers, others, roomActions, useRoom } from './roomState'
import type { ClientMessage, PlayerInfo, ServerMessage, Welcome, WorldAction } from './protocol'
import { network } from '../game/actions'
import { cells } from '../game/blueprints/theatre'
import { sky } from '../game/daylight'
import { useInventory } from '../game/inventory'
import { useShared, type Shared } from '../game/shared'
import { useGame } from '../game/store'
import { Block } from '../voxel/blocks'
import { getWorld } from '../voxel/world'
import { playerState } from '../world/player'

/** How long a phrase stays on screen, in milliseconds. */
const SAID_FOR = 6000

/**
 * Keeps this game in step with its room (Phase 12): sends this player's changes, shared progress,
 * position, inventory, phrases and pointing, and applies everyone else's. A dropped connection is
 * reopened in place, and the game catches up from the room's new snapshot.
 */
export function startSync() {
  const { welcome } = connection
  if (!connection.socket || !welcome) return
  let me: PlayerInfo = welcome.you
  const send = (message: ClientMessage) => {
    const socket = connection.socket
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }
  useRoom.setState({ code: welcome.code, me, players: welcome.players, status: 'connected', messages: [] })

  // This player's world changes: shown at once, put back if the room refuses them.
  let ref = 0
  const waiting = new Map<number, { action: WorldAction; before: number }>()
  network.send = (action, before) => {
    ref++
    waiting.set(ref, { action, before })
    send({ type: 'action', action, ref })
  }
  roomActions.say = (phrase) => send({ type: 'say', phrase })
  roomActions.point = (cell) => send({ type: 'point', cell })
  roomActions.kick = (id) => send({ type: 'kick', id })

  // Shared progress made here goes to the room; the clock is the room's, so time is not sent.
  let remote = false
  const fromRoom = (patch: Partial<Shared>) => { remote = true; useShared.setState(patch); remote = false }
  useShared.subscribe((state, previous) => {
    if (remote) return
    const patch: Partial<Shared> = {}
    for (const key of Object.keys(state) as (keyof Shared)[]) {
      if (key !== 'time' && state[key] !== previous[key]) (patch as Record<string, unknown>)[key] = state[key]
    }
    if (Object.keys(patch).length) send({ type: 'shared', patch })
  })

  // Where this player stands and what they hold, ten times a second while it changes.
  let last = ''
  setInterval(() => {
    const { x, y, z } = playerState.body.position
    const [lx, , lz] = playerState.look
    const item = useInventory.getState().slots[useGame.getState().hotbar]?.item ?? null
    const pose = { p: [x, y, z] as [number, number, number], yaw: Math.atan2(lx, lz), item }
    const key = JSON.stringify(pose)
    if (key === last) return
    last = key
    send({ type: 'move', ...pose })
  }, 100)

  // The inventory is kept by the room, so it is there when this player comes back.
  let saving: ReturnType<typeof setTimeout> | undefined
  const sendInventory = () => send({ type: 'inventory', slots: useInventory.getState().slots })
  useInventory.subscribe((state, previous) => {
    if (state.slots === previous.slots) return
    clearTimeout(saving)
    saving = setTimeout(sendInventory, 1000)
  })

  const name = (id: string) => id === me.id ? me : useRoom.getState().players.find((player) => player.id === id)

  /** After a rejoin: the room's world and progress replace what this game had; the inventory stays. */
  const catchUp = (fresh: Welcome) => {
    me = fresh.you
    waiting.clear()
    others.clear()
    getWorld().regenerate(fresh.edits)
    fromRoom(fresh.shared)
    sky.time = fresh.shared.time
    useRoom.setState({ me, players: fresh.players, status: 'connected' })
    last = ''
    sendInventory()
  }

  // A dropped connection: try again, waiting a little longer each time, for about two minutes.
  let retrying = false
  const retry = async () => {
    if (retrying) return
    retrying = true
    useRoom.setState({ status: 'reconnecting' })
    for (const wait of [500, 1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000]) {
      await new Promise((resolve) => setTimeout(resolve, wait))
      const result = await reconnect()
      if (typeof result !== 'string') { catchUp(result); retrying = false; return }
      if (result === 'kicked' || result === 'unknown-room') { leaveRoomWith(result); return }
    }
    retrying = false
    useRoom.setState({ status: 'lost' })
  }

  const receive = (message: ServerMessage) => {
    const world = getWorld()
    switch (message.type) {
      case 'applied': {
        if (message.from === me.id) {
          const mine = waiting.get(message.ref)
          waiting.delete(message.ref)
          if (!message.ok && mine && mine.action.type !== 'restart') world.set(mine.action.x, mine.action.y, mine.action.z, mine.before)
          return
        }
        if (!message.ok) return
        const action = message.action
        if (action.type === 'set') world.set(action.x, action.y, action.z, action.block)
        else if (action.type === 'break') world.set(action.x, action.y, action.z, Block.air)
        else for (const cell of cells) {
          if (cell.mission === action.mission && cell.accept.includes(world.get(cell.x, cell.y, cell.z))) world.set(cell.x, cell.y, cell.z, Block.air)
        }
        return
      }
      case 'shared': fromRoom(message.patch); return
      case 'time': fromRoom({ time: message.time }); sky.time = message.time; return
      case 'joined': useRoom.setState((state) => ({ players: [...state.players.filter((p) => p.id !== message.player.id), message.player] })); return
      case 'left':
        others.delete(message.id)
        bubbles.delete(message.id)
        markers.delete(message.id)
        useRoom.setState((state) => ({ players: state.players.filter((p) => p.id !== message.id) }))
        return
      case 'poses':
        for (const pose of message.poses) if (pose.id !== me.id) others.set(pose.id, { ...pose, at: performance.now() })
        return
      case 'said': {
        const who = name(message.from)
        if (!who) return
        bubbles.set(message.from, { phrase: message.phrase, at: performance.now() })
        const key = performance.now()
        useRoom.setState((state) => ({ messages: [...state.messages, { key, from: message.from, name: who.name, color: who.color, phrase: message.phrase }].slice(-4) }))
        setTimeout(() => useRoom.setState((state) => ({ messages: state.messages.filter((item) => item.key !== key) })), SAID_FOR)
        return
      }
      case 'pointed': {
        const who = name(message.from)
        if (who) markers.set(message.from, { cell: message.cell, at: performance.now(), color: who.color })
        return
      }
      case 'kicked': leaveRoomWith('kicked'); return
      case 'error': void retry(); return
    }
  }
  connection.listener = receive
  for (const message of connection.early.splice(0)) receive(message)
}
