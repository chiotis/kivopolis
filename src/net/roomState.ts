import { create } from 'zustand'
import type { PlayerInfo, Pose } from './protocol'

/** The room this game is playing in (Phase 12): who is here, and whether the connection holds. */
export interface RoomState {
  code: string | null
  me: PlayerInfo | null
  /** The other players in the room. */
  players: PlayerInfo[]
  /** Reconnecting after a dropped connection; lost once the game has stopped trying. */
  status: 'connected' | 'reconnecting' | 'lost'
  /** Phrases said in the last few seconds, newest last. */
  messages: { key: number; from: string; name: string; color: number; phrase: number }[]
  /** The phrase menu is open (T). */
  phrasing: boolean
}

export const useRoom = create<RoomState>(() => ({ code: null, me: null, players: [], status: 'connected', messages: [], phrasing: false }))

/** What other players said lately, shown as a bubble over their heads, by player id. */
export const bubbles = new Map<string, { phrase: number; at: number }>()
/** Blocks players pointed at, by player id, with when and in which colour. */
export const markers = new Map<string, { cell: [number, number, number]; at: number; color: number }>()

/** What the room panel and the keys can do; set once the game is connected (see sync.ts). */
export const roomActions = {
  say: (_phrase: number) => undefined as void,
  point: (_cell: [number, number, number]) => undefined as void,
  kick: (_id: string) => undefined as void,
}

/** Where the other players are: updated ten times a second, read every frame, so kept out of React state. */
export const others = new Map<string, Pose & { at: number }>()

/** Tunic colours, one per player in a room. */
export const TUNICS = ['#b5523b', '#3f6fa8', '#4f8a4a', '#c79a2e', '#7b4f9e'] as const
