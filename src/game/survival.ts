import { create } from 'zustand'
import { S } from '../voxel/grid'
import { useShared } from './shared'

/**
 * Survival (Phase 16): this player's health, hurt by long falls and slowly restored, and their
 * hunger, which falls as they go about and is filled by eating. Both belong to one player, so they
 * are kept on this device with the player's position, never shared with a room. A player whose
 * health runs out faints and wakes with full health, keeping everything they carry. Hunger alone
 * never makes anyone faint: an empty stomach wears health down to its last point and stops there.
 */

export type GameMode = 'gather' | 'survival' | 'creative'
export const MAX_HEALTH = 20
/** Falls of up to this many blocks never hurt; every block beyond takes one point. */
export const SAFE_FALL = 3
/** Health comes back one point at a time, once the player has not been hurt for a while. */
export const REGEN_DELAY = 6
export const REGEN_EVERY = 3
export const MAX_FOOD = 20
/** Hunger falls a point every this many seconds of walking about; sprinting counts double. */
export const HUNGER_EVERY = 30
/** Health only comes back while the player has eaten enough: more than this. */
export const FED = 6
/** With nothing left to eat, health falls a point every this many seconds, down to one point. */
export const STARVE_EVERY = 10

/** Survival counts in a survival game, and pauses while the host has turned creative play on. */
export const survivalActive = () => {
  const { survival, creative } = useShared.getState()
  return survival && !creative
}

export const modeOf = ({ survival, creative }: { survival: boolean; creative: boolean }): GameMode =>
  creative ? 'creative' : survival ? 'survival' : 'gather'

/** The health a fall of this height (in world units, from its highest point) costs. */
export function fallDamage(height: number) {
  return Math.max(0, Math.floor(height / S - SAFE_FALL + 1e-6))
}

interface SurvivalState {
  health: number
  /** Seconds since the last hurt, which holds back healing. */
  calm: number
  /** Seconds towards the next point of healing. */
  mend: number
  /** performance.now() of the last hurt, which flashes the screen red. */
  hurtAt: number
  food: number
  /** Seconds of effort towards the next point of hunger. */
  appetite: number
  /** Seconds towards the next point an empty stomach costs. */
  starve: number
}

export const initialSurvival = (health = MAX_HEALTH, food = MAX_FOOD): SurvivalState =>
  ({ health, calm: REGEN_DELAY, mend: 0, hurtAt: -Infinity, food, appetite: 0, starve: 0 })
export const useSurvival = create<SurvivalState>(() => initialSurvival())

export const readHealth = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_HEALTH, Math.max(1, Math.round(value))) : MAX_HEALTH
export const readFood = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_FOOD, Math.max(0, Math.round(value))) : MAX_FOOD

/** Takes health; returns true when it ran out (the player faints). */
export function hurt(amount: number, now = performance.now()) {
  if (amount <= 0 || !survivalActive()) return false
  const health = Math.max(0, useSurvival.getState().health - amount)
  useSurvival.setState({ health, calm: 0, mend: 0, hurtAt: now })
  return health === 0
}

/**
 * One frame of survival: hunger grows with effort (1 resting or walking, 2 sprinting), health heals
 * a point at a time after a quiet spell while the player is fed, and an empty stomach wears it down.
 */
export function tickSurvival(dt: number, effort = 1) {
  if (!survivalActive()) return
  const state = useSurvival.getState()
  const next: Partial<SurvivalState> = {}
  let { food, health } = state
  // Hunger.
  let appetite = state.appetite + dt * effort
  if (appetite >= HUNGER_EVERY) { appetite -= HUNGER_EVERY; food = Math.max(0, food - 1) }
  next.appetite = appetite
  next.food = food
  // Starving: down to the last point, never past it.
  if (food === 0 && health > 1) {
    const starve = state.starve + dt
    if (starve >= STARVE_EVERY) { next.starve = starve - STARVE_EVERY; health -= 1; next.hurtAt = performance.now() }
    else next.starve = starve
  } else next.starve = 0
  // Healing.
  const calm = state.calm + dt
  next.calm = calm
  if (health < MAX_HEALTH && food > FED && calm >= REGEN_DELAY) {
    const mend = state.mend + dt
    if (mend >= REGEN_EVERY) { next.mend = mend - REGEN_EVERY; health += 1 } else next.mend = mend
  } else next.mend = 0
  next.health = health
  useSurvival.setState(next)
}

/** Eats or drinks one of the held food: 'ate', 'full' when the player cannot eat more, or null when it is not food or survival is off. */
export function eat(value: number | undefined): 'ate' | 'full' | null {
  if (!value || !survivalActive()) return null
  const { food } = useSurvival.getState()
  if (food >= MAX_FOOD) return 'full'
  useSurvival.setState({ food: Math.min(MAX_FOOD, food + value) })
  return 'ate'
}

/** Waking after a faint: full health, nothing lost; hunger stays as it was, but never empty. */
export const wake = () => useSurvival.setState(initialSurvival(MAX_HEALTH, Math.max(FED + 1, useSurvival.getState().food)))
/** A new game: full health and a full stomach. */
export const freshSurvival = () => useSurvival.setState(initialSurvival())
