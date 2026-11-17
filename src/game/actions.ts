import { Block, blocks } from '../voxel/blocks'
import { S, getWorld, index, wx, wy, wz } from '../voxel/world'
import { cellsOfStep } from './plans'
import { inventory, type SlotRef } from './inventory'
import { drops, spawnDrop } from '../world/dropState'
import { herd, strikeAnimal, tendAnimal } from '../world/herd'
import type { Stack } from './items'
import type { Point } from './theatre'
import type { WorldAction } from '../net/protocol'

type Vec = [number, number, number]

/**
 * Every change a player makes to the shared world, as one small plain object (Phase 11, ready for
 * multiplayer). The game applies them here, in one place; in a room (Phase 12) the same objects are
 * sent to the room server, which checks them, orders them and applies them with this function too.
 *
 * Nothing else in the game writes to the world, the dropped items, the kilns or the animals: the
 * world generator, the water ticks and loading an old save are the only other writers, and none
 * of them is a player's change.
 */
export type Action =
  /** Put a block into a cell: building, pouring water from a hydria, or scooping it up (air). */
  | { type: 'set'; x: number; y: number; z: number; block: number }
  /** Break the block in a cell; `drop` is what it gives (decided by the player's tool). A kiln spills its contents. */
  | { type: 'break'; x: number; y: number; z: number; drop: Stack | null }
  /** Take down every built block of a step (the theatre's or a later building's) and hand the blocks back. */
  | { type: 'restart'; mission: string; at: Point }
  /** Hit an animal (wool, feathers) or tend it (milk), by its id. */
  | { type: 'strike' | 'tend'; animal: number }
  /** Pick up a dropped item, by its id. */
  | { type: 'pickup'; drop: number }
  /** Throw items into the world, e.g. with Q or when closing a full backpack. */
  | { type: 'throw'; stack: Stack; from: Vec; velocity: Vec; delay: number }
  /** Open the backpack or a workshop (2 or 3 crafting slots a side), or the kiln at a cell. */
  | { type: 'open'; craftSize: 2 | 3; kiln: string | null }
  /** Click a slot of the backpack, the crafting grid or the open kiln. */
  | { type: 'slot'; ref: SlotRef; button: 'left' | 'right'; shift: boolean }

/**
 * While playing in a room, changes to the world are also sent to the room server, with the block
 * that was there before so a refused change can be put back (Phase 12).
 */
export const network: {
  send: ((action: WorldAction, before: number) => void) | null
  /** Asks the room for (part of) a dropped item; it answers with what this player gets. */
  pickup: ((drop: number, count: number) => void) | null
  /** Asks the room for a kiln's contents; only one player at a time uses a kiln. */
  openKiln: ((cell: string) => void) | null
} = { send: null, pickup: null, openKiln: null }

/** Applies one action. Returns false when it changed nothing. */
export function apply(action: Action): boolean {
  const world = getWorld()
  switch (action.type) {
    case 'set': {
      const { x, y, z, block } = action
      const before = world.get(x, y, z)
      if (!world.set(x, y, z, block)) return false
      network.send?.({ type: 'set', x, y, z, block }, before)
      return true
    }
    case 'break': {
      const { x, y, z } = action
      const id = world.get(x, y, z)
      if (!world.set(x, y, z, Block.air)) return false
      // In a room the room drops what the block gives, and spills a kiln, so everyone sees the same items.
      if (network.send) { network.send({ type: 'break', x, y, z, drop: action.drop }, id); return true }
      const cx = wx(x) + S / 2, cy = wy(y) + S / 2, cz = wz(z) + S / 2
      if (action.drop) spawnDrop(action.drop, cx, cy, cz)
      if (id === Block.kiln) for (const stack of inventory.removeKiln(String(index(x, y, z)))) spawnDrop(stack, cx, cy, cz)
      return true
    }
    case 'restart': {
      // Taking the step's blocks down gives them back, so nothing the player gathered is lost.
      const refund = new Map<string, number>()
      for (const cell of cellsOfStep(action.mission)) {
        if (!cell.accept.includes(world.get(cell.x, cell.y, cell.z))) continue
        const key = blocks[world.get(cell.x, cell.y, cell.z)].key
        world.set(cell.x, cell.y, cell.z, Block.air)
        refund.set(key, (refund.get(key) ?? 0) + 1)
      }
      const [x, , z] = action.at
      for (const [item, count] of refund) {
        for (let left = count; left > 0; left -= 64) {
          const rest = inventory.add({ item, count: Math.min(64, left) })
          if (rest) spawnDrop({ item, count: rest }, x, world.surface(x, z) + 0.5, z)
        }
      }
      network.send?.({ type: 'restart', mission: action.mission }, Block.air)
      return refund.size > 0
    }
    case 'strike':
    case 'tend': {
      const animal = herd.list.find((item) => item.id === action.animal)
      if (!animal) return false
      if (action.type === 'strike') strikeAnimal(animal)
      else tendAnimal(animal)
      return true
    }
    case 'pickup': {
      const drop = drops.find((item) => item.id === action.drop)
      if (!drop || drop.stack.count <= 0) return false
      if (network.pickup) {
        const count = inventory.fits(drop.stack)
        const now = performance.now()
        if (!count || (drop.asked && now - drop.asked < 2000)) return false
        drop.asked = now
        network.pickup(drop.id, count)
        return false
      }
      const left = inventory.add(drop.stack)
      const taken = left < drop.stack.count
      drop.stack.count = left
      return taken
    }
    case 'throw':
      spawnDrop(action.stack, ...action.from, action.velocity, action.delay)
      return true
    case 'open':
      inventory.open(action.craftSize, action.kiln, !network.openKiln)
      if (action.kiln) network.openKiln?.(action.kiln)
      return true
    case 'slot':
      inventory.click(action.ref, action.button, action.shift)
      return true
  }
}
