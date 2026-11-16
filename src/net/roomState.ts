import { create } from 'zustand'
import type { PlayerInfo, Pose } from './protocol'

/** The room this game is playing in (Phase 12): who is here, and whether the connection holds. */
export interface RoomState {
  code: string | null
  me: PlayerInfo | null
  /** The other players in the room. */
  players: PlayerInfo[]
  status: 'connected' | 'lost'
}

export const useRoom = create<RoomState>(() => ({ code: null, me: null, players: [], status: 'connected' }))

/** Where the other players are: updated ten times a second, read every frame, so kept out of React state. */
export const others = new Map<string, Pose & { at: number }>()

/** Tunic colours, one per player in a room. */
export const TUNICS = ['#b5523b', '#3f6fa8', '#4f8a4a', '#c79a2e', '#7b4f9e'] as const
