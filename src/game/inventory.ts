import { create } from 'zustand'
import { fuel, itemByKey, maxStack, smelting, type Stack } from './items'
import { emptyKiln, kilnContents, stepKiln, validKiln, validStack, type Kiln } from './kiln'
import { matchRecipe } from './recipes'
import { readRecord, writeRecord } from './save'

export const HOTBAR = 9
export const SLOTS = 36

export type { Kiln }
export type Area = 'inv' | 'craft' | 'kilnInput' | 'kilnFuel' | 'kilnOutput'
export interface SlotRef { area: Area; index: number }

interface InventoryState {
  slots: (Stack | null)[]
  /** The stack carried by the pointer while the inventory screen is open. */
  cursor: Stack | null
  craft: (Stack | null)[]
  craftSize: 2 | 3
  kilns: Record<string, Kiln>
  /** World cell index of the kiln whose screen is open. */
  openKiln: string | null
}

const fresh = (): InventoryState => ({
  slots: Array(SLOTS).fill(null), cursor: null, craft: Array(9).fill(null), craftSize: 2, kilns: {}, openKiln: null,
})

const same = (a: Stack | null, b: Stack | null) => Boolean(a && b && a.item === b.item && !a.damage && !b.damage)

function load(): InventoryState {
  const state = fresh()
  try {
    const data = readRecord<{ version?: number; slots?: unknown[]; kilns?: Record<string, Partial<Kiln>> }>('inventory')
    if (!data || data.version !== 1) return state
    if (Array.isArray(data.slots)) data.slots.slice(0, SLOTS).forEach((stack, i) => { state.slots[i] = validStack(stack) })
    for (const [cell, kiln] of Object.entries(data.kilns ?? {})) {
      if (!/^\d+$/.test(cell) || !kiln) continue
      state.kilns[cell] = validKiln(kiln)
    }
  } catch {
    // Fall back to an empty inventory.
  }
  return state
}

/** Adds a stack into a list of slots (merging first); returns what did not fit. */
export function insert(slots: (Stack | null)[], stack: Stack, order: number[]): number {
  let left = stack.count
  const limit = maxStack(stack.item)
  if (!stack.damage) {
    for (const i of order) {
      const slot = slots[i]
      if (!left || !slot || slot.item !== stack.item || slot.damage) continue
      const moved = Math.min(left, limit - slot.count)
      if (moved > 0) { slots[i] = { ...slot, count: slot.count + moved }; left -= moved }
    }
  }
  for (const i of order) {
    if (!left || slots[i]) continue
    const moved = Math.min(left, limit)
    slots[i] = { ...stack, count: moved }
    left -= moved
  }
  return left
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)
const hotbarFirst = range(0, SLOTS)
const mainFirst = [...range(HOTBAR, SLOTS), ...range(0, HOTBAR)]

/** Whether a stack may be put into a slot of this area. */
function accepts(area: Area, stack: Stack) {
  if (area === 'kilnOutput') return false
  if (area === 'kilnFuel') return stack.item in fuel
  if (area === 'kilnInput') return stack.item in smelting
  return true
}

export const useInventory = create<InventoryState>(() => load())

function kilnOf(state: InventoryState) {
  // In a room the kiln's contents come from the room server; until they arrive it cannot be used.
  return state.openKiln ? state.kilns[state.openKiln] ?? null : null
}

function read(state: InventoryState, ref: SlotRef): Stack | null {
  if (ref.area === 'inv') return state.slots[ref.index]
  if (ref.area === 'craft') return state.craft[ref.index]
  const kiln = kilnOf(state)
  if (!kiln) return null
  return ref.area === 'kilnInput' ? kiln.input : ref.area === 'kilnFuel' ? kiln.fuel : kiln.output
}

/** Returns a patch that writes one slot. */
function write(state: InventoryState, ref: SlotRef, stack: Stack | null): Partial<InventoryState> {
  if (ref.area === 'inv') {
    const slots = [...state.slots]; slots[ref.index] = stack
    return { slots }
  }
  if (ref.area === 'craft') {
    const craft = [...state.craft]; craft[ref.index] = stack
    return { craft }
  }
  const cell = state.openKiln!
  const kiln = { ...(state.kilns[cell] ?? emptyKiln()) }
  if (ref.area === 'kilnInput') kiln.input = stack
  else if (ref.area === 'kilnFuel') kiln.fuel = stack
  else kiln.output = stack
  return { kilns: { ...state.kilns, [cell]: kiln } }
}

export const inventory = {
  /** Adds items to the player inventory; returns the count that did not fit. */
  add(stack: Stack) {
    const slots = [...useInventory.getState().slots]
    const left = insert(slots, stack, hotbarFirst)
    if (left !== stack.count) useInventory.setState({ slots })
    return left
  },

  /**
   * Creative palette: picks up a full stack of an item, or with shift puts it straight into the
   * inventory. Clicking the palette while carrying something throws the carried stack away.
   */
  palette(key: string | null, shift = false) {
    const state = useInventory.getState()
    if (!key) { useInventory.setState({ cursor: null }); return }
    const stack = { item: key, count: maxStack(key) }
    if (shift) { inventory.add(stack); return }
    useInventory.setState({ cursor: state.cursor?.item === key ? null : stack })
  },

  /** Removes `count` from an inventory slot. */
  take(index: number, count = 1) {
    const { slots } = useInventory.getState()
    const slot = slots[index]
    if (!slot) return null
    const next = [...slots]
    next[index] = slot.count > count ? { ...slot, count: slot.count - count } : null
    useInventory.setState({ slots: next })
    return { ...slot, count: Math.min(count, slot.count) }
  },

  /** Puts a different item in a slot, such as a hydria that was just filled or emptied. */
  replace(index: number, stack: Stack | null) {
    const next = [...useInventory.getState().slots]
    next[index] = stack
    useInventory.setState({ slots: next })
  },

  /** Wears the tool in a slot; it breaks when its durability runs out. */
  wear(index: number) {
    const { slots } = useInventory.getState()
    const slot = slots[index]
    const tool = slot && itemByKey.get(slot.item)?.tool
    if (!slot || !tool) return false
    const damage = (slot.damage ?? 0) + 1
    const next = [...slots]
    next[index] = damage >= tool.durability ? null : { ...slot, damage }
    useInventory.setState({ slots: next })
    return damage >= tool.durability
  },

  click(ref: SlotRef, button: 'left' | 'right', shift: boolean) {
    const state = useInventory.getState()
    const slot = read(state, ref)
    const cursor = state.cursor
    if (ref.area !== 'inv' && ref.area !== 'craft' && !kilnOf(state)) return

    if (shift && slot) {
      // Quick move: containers → inventory; inventory → kiln (if open) or between hotbar and main.
      const slots = [...state.slots]
      let left: number
      if (ref.area !== 'inv') {
        left = insert(slots, slot, hotbarFirst)
        useInventory.setState({ ...write({ ...state, slots }, ref, left ? { ...slot, count: left } : null), slots })
        return
      }
      const kiln = kilnOf(state)
      const target: Area | null = kiln ? (slot.item in smelting ? 'kilnInput' : slot.item in fuel ? 'kilnFuel' : null) : null
      if (target) {
        const current = read(state, { area: target, index: 0 })
        if (current && !same(current, slot)) return
        const room = maxStack(slot.item) - (current?.count ?? 0)
        const moved = Math.min(room, slot.count)
        if (moved <= 0) return
        slots[ref.index] = slot.count > moved ? { ...slot, count: slot.count - moved } : null
        useInventory.setState({ ...write({ ...state, slots }, { area: target, index: 0 }, { ...slot, count: (current?.count ?? 0) + moved }), slots })
        return
      }
      slots[ref.index] = null
      const order = ref.index < HOTBAR ? range(HOTBAR, SLOTS) : range(0, HOTBAR)
      left = insert(slots, slot, order)
      if (left) slots[ref.index] = { ...slot, count: left }
      useInventory.setState({ slots })
      return
    }

    if (ref.area === 'kilnOutput') {
      if (!slot) return
      if (!cursor) useInventory.setState({ cursor: slot, ...write(state, ref, null) })
      else if (same(cursor, slot)) {
        const moved = Math.min(slot.count, maxStack(slot.item) - cursor.count)
        if (moved > 0) useInventory.setState({
          cursor: { ...cursor, count: cursor.count + moved },
          ...write(state, ref, slot.count > moved ? { ...slot, count: slot.count - moved } : null),
        })
      }
      return
    }

    if (button === 'right') {
      if (!cursor && slot) {
        const half = Math.ceil(slot.count / 2)
        useInventory.setState({ cursor: { ...slot, count: half }, ...write(state, ref, slot.count > half ? { ...slot, count: slot.count - half } : null) })
      } else if (cursor && accepts(ref.area, cursor) && (!slot || (same(slot, cursor) && slot.count < maxStack(slot.item)))) {
        useInventory.setState({
          cursor: cursor.count > 1 ? { ...cursor, count: cursor.count - 1 } : null,
          ...write(state, ref, { ...cursor, count: (slot?.count ?? 0) + 1 }),
        })
      }
      return
    }

    if (!cursor) {
      if (slot) useInventory.setState({ cursor: slot, ...write(state, ref, null) })
    } else if (!accepts(ref.area, cursor)) {
      return
    } else if (!slot) {
      useInventory.setState({ cursor: null, ...write(state, ref, cursor) })
    } else if (same(slot, cursor)) {
      const moved = Math.min(cursor.count, maxStack(slot.item) - slot.count)
      useInventory.setState({
        cursor: cursor.count > moved ? { ...cursor, count: cursor.count - moved } : null,
        ...write(state, ref, { ...slot, count: slot.count + moved }),
      })
    } else {
      useInventory.setState({ cursor: slot, ...write(state, ref, cursor) })
    }
  },

  /** The crafting result for the current grid, if any. */
  result(state = useInventory.getState()) {
    const cells = state.craft.slice(0, state.craftSize * state.craftSize)
    // A 2 × 2 grid is stored in the first four cells.
    return matchRecipe(cells, state.craftSize)?.result ?? null
  },

  /** Takes one craft (or as many as fit with shift) from the result slot. */
  craft(shift: boolean) {
    for (let crafted = 0; crafted < 64; crafted++) {
      const state = useInventory.getState()
      const result = inventory.result(state)
      if (!result) return
      const size = state.craftSize * state.craftSize
      const craft = state.craft.map((cell, i) => (i < size && cell ? (cell.count > 1 ? { ...cell, count: cell.count - 1 } : null) : cell))
      if (shift) {
        const slots = [...state.slots]
        if (insert(slots, result, mainFirst)) return
        useInventory.setState({ slots, craft })
      } else {
        const cursor = state.cursor
        if (cursor && (!same(cursor, result) || cursor.count + result.count > maxStack(result.item))) return
        useInventory.setState({ craft, cursor: { ...result, count: (cursor?.count ?? 0) + result.count } })
        return
      }
    }
  },

  /** Opens the crafting grid, or a kiln; `create` is false in a room, where the room sends the kiln's contents. */
  open(craftSize: 2 | 3, kiln: string | null = null, create = true) {
    useInventory.setState((state) => ({
      craftSize, openKiln: kiln,
      kilns: kiln && create && !state.kilns[kiln] ? { ...state.kilns, [kiln]: emptyKiln() } : state.kilns,
    }))
  },

  /** How many of a stack fit into the inventory. */
  fits(stack: Stack) {
    const slots = [...useInventory.getState().slots]
    return stack.count - insert(slots, stack, hotbarFirst)
  },

  /** Puts a kiln's contents in place (from the room server), or removes the kiln with null. */
  setKiln(cell: string, kiln: Kiln | null) {
    useInventory.setState((state) => {
      const kilns = { ...state.kilns }
      if (kiln) kilns[cell] = kiln
      else delete kilns[cell]
      return { kilns }
    })
  },

  /** Returns the crafting grid and carried stack to the inventory; whatever does not fit is returned for dropping. */
  close(): Stack[] {
    const state = useInventory.getState()
    const slots = [...state.slots]
    const spill: Stack[] = []
    for (const stack of [...state.craft, state.cursor]) {
      if (!stack) continue
      const left = insert(slots, stack, hotbarFirst)
      if (left) spill.push({ ...stack, count: left })
    }
    useInventory.setState({ slots, craft: Array(9).fill(null), cursor: null, openKiln: null })
    return spill
  },

  /** Removes a kiln's state when its block is broken, returning its contents. */
  removeKiln(cell: string): Stack[] {
    const { kilns, openKiln } = useInventory.getState()
    const kiln = kilns[cell]
    if (!kiln) return []
    const rest = { ...kilns }
    delete rest[cell]
    useInventory.setState({ kilns: rest, openKiln: openKiln === cell ? null : openKiln })
    return kilnContents(kiln)
  },

  /** Advances every kiln: burn fuel while there is something to smelt and room for the result. */
  tick(dt: number) {
    const { kilns } = useInventory.getState()
    let changed = false
    const next: Record<string, Kiln> = {}
    for (const [cell, current] of Object.entries(kilns)) {
      next[cell] = stepKiln(current, dt)
      if (next[cell] !== current) changed = true
    }
    if (changed) useInventory.setState({ kilns: next })
  },
}

/** Clears the inventory and kilns (campaign reset). */
export function resetInventory() {
  useInventory.setState(fresh())
  clearTimeout(saveTimer)
  writeRecord('inventory', undefined)
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
useInventory.subscribe((state, previous) => {
  if (state.slots === previous.slots && state.kilns === previous.kilns) return
  clearTimeout(saveTimer)
  // Stacks are copied so later in-place changes never reach the queued record.
  saveTimer = setTimeout(() => writeRecord('inventory', structuredClone({ version: 1, slots: state.slots, kilns: state.kilns })), 300)
})
