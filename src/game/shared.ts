import { create } from 'zustand'
import type { BuildingProgress } from './buildings'
import type { Mission } from './theatre'

/**
 * The shared game: everything every player in a room sees the same (Phase 11, ready for
 * multiplayer). In single-player it lives in the browser and is saved with the game; in a room
 * (Phase 12) the room server owns it and sends it to everyone.
 *
 * What belongs to one player (position, inventory, hotbar, open panels, camera) stays in
 * `useGame` and `useInventory`, and device settings stay in `useGame().settings`.
 */
export interface Shared {
  /** A game has been started (the menu offers to continue it). */
  started: boolean
  /** The theatre's plan has been activated at the site sign. */
  discovered: boolean
  /** The theatre's tour has been taken: the theatre is finished. */
  completed: boolean
  /** Theatre steps whose completion has been celebrated, so rebuilding a broken block stays quiet. */
  celebrated: Mission[]
  /** Progress of the buildings after the theatre. */
  buildings: BuildingProgress
  /** History notes already found, so each pops up once. */
  facts: Fact[]
  /** Time of day, 0–1 (see game/daylight). */
  time: number
  /** Creative play: unlimited blocks, instant breaking and flight. */
  creative: boolean
}

/** History notes that pop up the first time something happens in the world. */
export type Fact = 'night' | 'lamp' | 'sheep' | 'goat' | 'chicken' | 'hydria'
export const factIds: readonly Fact[] = ['night', 'lamp', 'sheep', 'goat', 'chicken', 'hydria']

export const initialShared = (): Shared => ({
  started: false, discovered: false, completed: false, celebrated: [], buildings: {}, facts: [], time: 0.3, creative: false,
})

export const useShared = create<Shared>(() => initialShared())
