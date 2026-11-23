import { connection, leaveRoomWith, reconnect } from './client'
import { bubbles, markers, others, roomActions, useRoom } from './roomState'
import type { ClientMessage, PlayerInfo, ServerMessage, Welcome, WorldAction } from './protocol'
import { network } from '../game/actions'
import { blockSound } from '../game/audio'
import { copy } from '../game/el'
import { inventory } from '../game/inventory'
import type { Kiln } from '../game/kiln'
import { cellsOfStep } from '../game/plans'
import { sky } from '../game/daylight'
import { useInventory } from '../game/inventory'
import { useSurvival } from '../game/survival'
import { useShared, type Shared } from '../game/shared'
import { useGame } from '../game/store'
import { Block } from '../voxel/blocks'
import { getWorld } from '../voxel/world'
import { playerState } from '../world/player'
import { addDrop, dropNetwork, drops, setDrops, spawnDrop } from '../world/dropState'
import { herd, setHerd } from '../world/herd'

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

  // The room runs the dropped items, the animals and the kilns; this game shows them and asks for them.
  setDrops(welcome.drops)
  setHerd(welcome.animals)
  dropNetwork.spawn = (stack, from, velocity, delay) => send({ type: 'throw', stack, from, velocity, delay })
  network.pickup = (drop, count) => send({ type: 'pickup', drop, count })
  network.openKiln = (cell) => send({ type: 'kilnOpen', cell })
  herd.send = (animal, act) => send({ type: 'animal', animal, act })

  // While this player has a kiln open it burns here, and its contents go to the room: at once after
  // a click, at most twice a second while it only burns. Closing it hands it back to the room.
  let kilnSent = 0
  let kilnLater: ReturnType<typeof setTimeout> | undefined
  const sendKiln = (cell: string, kiln: Kiln) => { clearTimeout(kilnLater); kilnSent = performance.now(); send({ type: 'kilnSet', cell, kiln }) }
  const sameStacks = (a: Kiln, b: Kiln) => (['input', 'fuel', 'output'] as const).every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]))
  let fromRoomKiln = false
  useInventory.subscribe((state, previous) => {
    const was = previous.openKiln
    if (was && state.openKiln !== was) {
      const kiln = previous.kilns[was]
      if (kiln) sendKiln(was, kiln)
      send({ type: 'kilnClose', cell: was })
      inventory.setKiln(was, null)
      return
    }
    const cell = state.openKiln
    const kiln = cell ? state.kilns[cell] : undefined
    const before = cell ? previous.kilns[cell] : undefined
    if (!cell || !kiln || kiln === before || fromRoomKiln) return
    if (!before || !sameStacks(kiln, before) || performance.now() - kilnSent > 500) { sendKiln(cell, kiln); return }
    clearTimeout(kilnLater)
    kilnLater = setTimeout(() => { const now = useInventory.getState(); if (now.openKiln === cell && now.kilns[cell]) sendKiln(cell, now.kilns[cell]) }, 500)
  })
  const closeKiln = (cell: string, notice: string) => {
    if (useInventory.getState().openKiln !== cell) return
    const game = useGame.getState()
    if (game.panel === 'kiln') game.setPanel(null)
    else useInventory.setState({ openKiln: null })
    inventory.setKiln(cell, null)
    game.setNotice(notice)
  }

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

  // So are this player's health, hunger and bed (Phase 16).
  let vitalsLater: ReturnType<typeof setTimeout> | undefined
  const sendVitals = () => {
    const { health, food, bed } = useSurvival.getState()
    send({ type: 'vitals', vitals: { health, food, bed } })
  }
  useSurvival.subscribe((state, previous) => {
    if (state.health === previous.health && state.food === previous.food && state.bed === previous.bed) return
    clearTimeout(vitalsLater)
    vitalsLater = setTimeout(sendVitals, 1000)
  })

  const name = (id: string) => id === me.id ? me : useRoom.getState().players.find((player) => player.id === id)

  /** After a rejoin: the room's world and progress replace what this game had; the inventory stays. */
  const catchUp = (fresh: Welcome) => {
    me = fresh.you
    waiting.clear()
    others.clear()
    getWorld().regenerate(fresh.edits)
    setDrops(fresh.drops)
    setHerd(fresh.animals)
    // The room may have restarted: a kiln left open here is closed rather than trusted.
    const open = useInventory.getState().openKiln
    if (open) closeKiln(open, copy.kilnClosed)
    fromRoom(fresh.shared)
    sky.time = fresh.shared.time
    useRoom.setState({ me, players: fresh.players, status: 'connected' })
    last = ''
    sendInventory()
    sendVitals()
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
        else for (const cell of cellsOfStep(action.mission)) {
          if (cell.accept.includes(world.get(cell.x, cell.y, cell.z))) world.set(cell.x, cell.y, cell.z, Block.air)
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
      case 'dropped':
        if (!drops.some((drop) => drop.id === message.drop.id)) addDrop(drops, { ...message.drop, stack: { ...message.drop.stack } })
        return
      case 'taken': {
        const drop = drops.find((item) => item.id === message.id)
        if (drop) { drop.stack.count = message.left; drop.asked = undefined }
        return
      }
      case 'gave': {
        const left = inventory.add(message.stack)
        const { x, y, z } = playerState.body.position
        if (left) spawnDrop({ ...message.stack, count: left }, x, y + 0.9, z, undefined, 1.5)
        if (useGame.getState().settings.sound) blockSound('soft', 'place')
        return
      }
      case 'herd':
        for (const pose of message.animals) herd.goals.set(pose[0], pose)
        return
      case 'kiln':
        if (useInventory.getState().openKiln !== message.cell) { send({ type: 'kilnClose', cell: message.cell }); return }
        fromRoomKiln = true
        inventory.setKiln(message.cell, message.kiln)
        fromRoomKiln = false
        return
      case 'kilnBusy': closeKiln(message.cell, copy.kilnBusy); return
      case 'kilnGone': closeKiln(message.cell, copy.kilnGone); return
      case 'error': void retry(); return
    }
  }
  connection.listener = receive
  for (const message of connection.early.splice(0)) receive(message)
}
