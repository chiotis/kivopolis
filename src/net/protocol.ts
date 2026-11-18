import type { Shared } from '../game/shared'
import type { Stack } from '../game/items'
import type { Kiln } from '../game/kiln'
import type { DropEntity } from '../world/dropState'
import type { Animal } from '../world/wildlife'
import type { AnimalPose } from '../world/herd'

/**
 * The messages between the game and the room server (Phase 12), as plain JSON. Both sides import
 * this file, so they never disagree on a message's shape.
 */

export const MAX_PLAYERS = 5
/** Room codes: six characters, without ones that are easy to confuse (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
export const NAME_LENGTH = 16

type Vec3 = [number, number, number]

/** A player's change to the shared world, as the room server checks, orders and relays it. */
export type WorldAction =
  | { type: 'set'; x: number; y: number; z: number; block: number }
  /** `drop` is what the block gives with the player's tool; the room drops it for everyone. */
  | { type: 'break'; x: number; y: number; z: number; drop?: Stack | null }
  | { type: 'restart'; mission: string }

export interface PlayerInfo {
  id: string
  name: string
  /** Index into the tunic colours, so each player in a room looks different. */
  color: number
  /** The player who created the room: may restart a step for everyone. */
  host: boolean
}

export interface Pose { id: string; p: Vec3; yaw: number; item: string | null }

/**
 * What a player brings into a room: a new one, or an existing room's code. `token` is the secret the
 * room gave this player on joining: with it, a dropped connection can take the player's place back.
 */
export type Request = { create: true; name: string } | { create: false; code: string; name: string; token?: string }

/**
 * The phrases players can say to each other. There is no free text chat: the players are children.
 * Messages carry the phrase's number, so a room can only ever show these words.
 */
export const PHRASES = [
  'Έλα εδώ!', 'Χρειάζομαι μάρμαρο', 'Χρειάζομαι ασβεστόλιθο', 'Χρειάζομαι ξύλο', 'Βοήθησέ με εδώ',
  'Πάω να μαζέψω υλικά', 'Περίμενε με', 'Μπράβο!', 'Ευχαριστώ!',
] as const

/** How long a player removed by the room's creator must wait before joining again. */
export const KICK_MINUTES = 10

export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string; token?: string }
  | { type: 'action'; action: WorldAction; ref: number }
  | { type: 'shared'; patch: Partial<Shared> }
  | { type: 'move'; p: Vec3; yaw: number; item: string | null }
  | { type: 'inventory'; slots: unknown[] }
  /** Survival (Phase 16): this player's health, hunger and bed, kept by the room for their return. */
  | { type: 'vitals'; vitals: Vitals }
  /** Say one of the preset phrases, by its number. */
  | { type: 'say'; phrase: number }
  /** Point everyone to a block. */
  | { type: 'point'; cell: Vec3 }
  /** The room's creator removes a player. */
  | { type: 'kick'; id: string }
  /** Throw items into the world; the room gives them an id and shows them to everyone. */
  | { type: 'throw'; stack: Stack; from: Vec3; velocity: Vec3; delay: number }
  /** Take up to `count` of a dropped item. */
  | { type: 'pickup'; drop: number; count: number }
  /** Hit or tend an animal. */
  | { type: 'animal'; animal: number; act: 'strike' | 'tend' }
  /** Use a kiln: ask for it, send its contents while using it, and let it go. */
  | { type: 'kilnOpen'; cell: string }
  | { type: 'kilnSet'; cell: string; kiln: Kiln }
  | { type: 'kilnClose'; cell: string }

/** One player's survival state, as the room keeps it. */
export interface Vitals { health: number; food: number; bed: Vec3 | null }

export type RoomError = 'full' | 'unknown-room' | 'bad-name' | 'name-taken' | 'bad-message' | 'unavailable' | 'kicked'

export interface Welcome {
  type: 'welcome'
  code: string
  you: PlayerInfo
  seed: number
  /** Every change to the generated world: [grid index, block id]. */
  edits: [number, number][]
  shared: Shared
  players: PlayerInfo[]
  /** This player's saved inventory and position in the room, if they have played here before. */
  inventory: unknown[] | null
  position: Vec3 | null
  /** This player's health, hunger and bed in the room (Phase 16); absent in rooms saved before it. */
  vitals?: Vitals | null
  /** This player's secret for taking their place back after a dropped connection. */
  token: string
  /** The items lying in the room's world, and its animals. */
  drops: DropEntity[]
  animals: Animal[]
}

export type ServerMessage =
  | Welcome
  | { type: 'error'; reason: RoomError }
  | { type: 'applied'; seq: number; from: string; ref: number; ok: boolean; action: WorldAction }
  | { type: 'shared'; patch: Partial<Shared>; from: string }
  | { type: 'joined'; player: PlayerInfo }
  | { type: 'left'; id: string }
  | { type: 'poses'; poses: Pose[] }
  | { type: 'time'; time: number }
  | { type: 'said'; from: string; phrase: number }
  | { type: 'pointed'; from: string; cell: Vec3 }
  /** Sent to a player the room's creator removed, just before the connection closes. */
  | { type: 'kicked' }
  /** A new dropped item, and what is left of one after someone took from it (0: it is gone). */
  | { type: 'dropped'; drop: DropEntity }
  | { type: 'taken'; id: number; left: number }
  /** Items for this player's inventory: a pickup, or milk. */
  | { type: 'gave'; stack: Stack }
  /** Where the animals are, five times a second. */
  | { type: 'herd'; animals: AnimalPose[] }
  /** The contents of the kiln this player asked for; or someone else is using it; or it was broken. */
  | { type: 'kiln'; cell: string; kiln: Kiln }
  | { type: 'kilnBusy'; cell: string }
  | { type: 'kilnGone'; cell: string }

/** Words a nickname may not contain (checked without accents, in Greek and Latin letters). */
const BANNED = ['μαλακ', 'πουστ', 'γαμ', 'σκατ', 'fuck', 'shit', 'bitch', 'cunt', 'nazi', 'sex']

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** A tidy nickname, or null when it is empty, too long, uses other characters or a banned word. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const tidy = name.replace(/\s+/g, ' ').trim()
  if (!tidy || tidy.length > NAME_LENGTH) return null
  if (!/^[\p{L}\p{N} ._-]+$/u.test(tidy)) return null
  if (BANNED.some((word) => plain(tidy).replace(/[^\p{L}]/gu, '').includes(word))) return null
  return tidy
}

export const cleanCode = (code: unknown) => {
  if (typeof code !== 'string') return null
  const tidy = code.trim().toUpperCase()
  return tidy.length === CODE_LENGTH && [...tidy].every((c) => CODE_ALPHABET.includes(c)) ? tidy : null
}

export function newCode(random: () => number = Math.random) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('')
}
