import { fuel, itemByKey, maxStack, SMELT_TIME, smelting, type Stack } from './items'

export interface Kiln {
  input: Stack | null
  fuel: Stack | null
  output: Stack | null
  /** Seconds of fuel left, and the length of the current fuel item. */
  burn: number
  burnMax: number
  /** Smelting progress of the current item, 0–1. */
  progress: number
}

export const emptyKiln = (): Kiln => ({ input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 })

const copy = (stack: Stack | null): Stack | null => (stack ? { ...stack } : null)

/** A stack as it may be stored: a known item, a count within its stack size. Anything else is null. */
export function validStack(value: unknown): Stack | null {
  const stack = value as Stack | null
  if (!stack || typeof stack !== 'object' || typeof stack.item !== 'string' || !itemByKey.has(stack.item)) return null
  const count = Math.min(maxStack(stack.item), Math.floor(Number(stack.count)))
  if (!(count > 0)) return null
  const damage = Number(stack.damage) > 0 ? Math.floor(Number(stack.damage)) : undefined
  return damage ? { item: stack.item, count, damage } : { item: stack.item, count }
}

/** A kiln as it may be stored, from saved or received data. */
export function validKiln(value: unknown): Kiln {
  const kiln = (value ?? {}) as Partial<Kiln>
  return {
    input: validStack(kiln.input), fuel: validStack(kiln.fuel), output: validStack(kiln.output),
    burn: Math.max(0, Number(kiln.burn) || 0), burnMax: Math.max(0, Number(kiln.burnMax) || 0),
    progress: Math.min(1, Math.max(0, Number(kiln.progress) || 0)),
  }
}

/**
 * One step of a kiln: it burns fuel while there is something to smelt and room for the result.
 * Plain code, so the game and the room server (Phase 12) run kilns the same way. Returns the new
 * kiln, or the same object when nothing changed.
 */
export function stepKiln(current: Kiln, dt: number): Kiln {
  const kiln = { ...current, input: copy(current.input), fuel: copy(current.fuel), output: copy(current.output) }
  const product = kiln.input ? smelting[kiln.input.item] : undefined
  const room = product && (!kiln.output || (kiln.output.item === product && kiln.output.count < maxStack(product)))
  if (kiln.burn > 0) kiln.burn = Math.max(0, kiln.burn - dt)
  if (room && kiln.burn <= 0 && kiln.fuel) {
    kiln.burn = kiln.burnMax = fuel[kiln.fuel.item] ?? 0
    kiln.fuel = kiln.fuel.count > 1 ? { ...kiln.fuel, count: kiln.fuel.count - 1 } : null
  }
  if (room && kiln.burn > 0) {
    kiln.progress += dt / SMELT_TIME
    if (kiln.progress >= 1) {
      kiln.progress = 0
      kiln.input = kiln.input!.count > 1 ? { ...kiln.input!, count: kiln.input!.count - 1 } : null
      kiln.output = { item: product!, count: (kiln.output?.count ?? 0) + 1 }
    }
  } else if (kiln.progress) {
    kiln.progress = Math.max(0, kiln.progress - dt / SMELT_TIME)
  }
  const changed = kiln.burn !== current.burn || kiln.progress !== current.progress || kiln.fuel?.count !== current.fuel?.count
  return changed ? kiln : current
}

/** What a kiln holds, for spilling it when its block is broken. */
export const kilnContents = (kiln: Kiln) => [kiln.input, kiln.fuel, kiln.output].filter(Boolean).map((stack) => ({ ...stack! }))
