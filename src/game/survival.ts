import { create } from 'zustand'
import { S } from '../voxel/grid'
import { useShared } from './shared'

/**
 * Survival (Phase 16): this player's health, hurt by long falls and slowly restored. It belongs to
 * one player, so it is kept on this device with the player's position, never shared with a room.
 * A player whose health runs out faints and wakes with full health, keeping everything they carry.
 */

export type GameMode = 'gather' | 'survival' | 'creative'
export const MAX_HEALTH = 20
/** Falls of up to this many blocks never hurt; every block beyond takes one point. */
export const SAFE_FALL = 3
/** Health comes back one point at a time, once the player has not been hurt for a while. */
export const REGEN_DELAY = 6
export const REGEN_EVERY = 3

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
}

export const initialSurvival = (health = MAX_HEALTH): SurvivalState => ({ health, calm: REGEN_DELAY, mend: 0, hurtAt: -Infinity })
export const useSurvival = create<SurvivalState>(() => initialSurvival())

export const readHealth = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_HEALTH, Math.max(1, Math.round(value))) : MAX_HEALTH

/** Takes health; returns true when it ran out (the player faints). */
export function hurt(amount: number, now = performance.now()) {
  if (amount <= 0 || !survivalActive()) return false
  const health = Math.max(0, useSurvival.getState().health - amount)
  useSurvival.setState({ health, calm: 0, mend: 0, hurtAt: now })
  return health === 0
}

/** Heals one point at a time after a quiet spell. */
export function tickSurvival(dt: number) {
  const state = useSurvival.getState()
  if (!survivalActive() || state.health >= MAX_HEALTH) {
    if (state.mend) useSurvival.setState({ mend: 0 })
    return
  }
  const calm = state.calm + dt
  if (calm < REGEN_DELAY) { useSurvival.setState({ calm }); return }
  const mend = state.mend + dt
  if (mend < REGEN_EVERY) { useSurvival.setState({ calm, mend }); return }
  useSurvival.setState({ calm, mend: mend - REGEN_EVERY, health: state.health + 1 })
}

/** Waking after a faint: full health, nothing lost. */
export const wake = () => useSurvival.setState(initialSurvival())
