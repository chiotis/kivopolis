import { Block } from '../../voxel/blocks'
import { OY, bx, bz } from '../../voxel/grid'
import { area } from '../regions'
import type { PlanCell, PlanStep } from '../plans'

/**
 * The sanctuary of Dionysus (Phase 13) as a voxel blueprint, built block by block like the
 * theatre. Block coordinates; north is -z and the temple faces east (+x), towards its altar.
 *
 *   x 103 ─────────────────────────────── 143   (the boundary wall, 41 blocks)
 *   z 218  ┌─────────── boundary wall ──────────┐
 *          ≡ west gate     north path        east gate ≡   ← the road runs through, z 221–224
 *   z 225  │  ┌────── temple (krepis) ──────┐        │
 *          │  │  cella      │ door │ porch  │  altar │
 *   z 244  │  └─────────────────────────────┘        │
 *   z 247  └────────────────────────────────────────┘
 *
 * Sizes follow the plan: columns 2 × 2 blocks on 4-block centres, 4 × 6 of them, a 24 × 16
 * stylobate on three steps (28 × 20 at the bottom), cella walls as tall as the columns.
 */

export const SANCTUARY_STEPS: readonly PlanStep[] = [
  { id: 'peribolos', reward: 150 },
  { id: 'altar', reward: 100 },
  { id: 'krepis', reward: 250 },
  { id: 'cella', reward: 250 },
  // Built in the next part of Phase 13.
  { id: 'columns', reward: 250 },
  { id: 'entablature', reward: 200 },
  { id: 'roof', reward: 250 },
  { id: 'statue', reward: 300 },
]

/** The sacred ground, inside the boundary wall's outer faces. */
export const WALL = { x0: bx(-44.25), x1: bx(-24.25), z0: bz(13.25), z1: bz(13.25) + 29 }
/** First course above the levelled ground. */
export const FLOOR = OY + Math.floor(area('sanctuary').height * 2 + 0.25)
/** The road's two gateways, east and west, open on the north path. */
export const GATE = { z0: WALL.z0 + 3, z1: WALL.z0 + 6, height: 4 }
/** The bottom step of the krepis. */
export const KREPIS = { x0: WALL.x0 + 3, x1: WALL.x0 + 30, z0: WALL.z0 + 7, z1: WALL.z0 + 26 }
/** The stylobate, two blocks in from the bottom step, which the columns and walls stand on. */
export const STYLOBATE = { x0: KREPIS.x0 + 2, x1: KREPIS.x1 - 2, z0: KREPIS.z0 + 2, z1: KREPIS.z1 - 2 }
/** Top of the stylobate: the first course of the columns and the cella. */
export const TEMPLE_FLOOR = FLOOR + 3
/** Columns, and so the cella walls, are 11 blocks tall with the capital. */
export const COLUMN_HEIGHT = 11
/** The cella: side walls, a back wall, and the wall with the door behind the east porch. */
export const CELLA = { x0: STYLOBATE.x0 + 5, x1: STYLOBATE.x1 - 5, door: STYLOBATE.x1 - 9, z0: STYLOBATE.z0 + 4, z1: STYLOBATE.z1 - 4 }
const axis = (KREPIS.z0 + KREPIS.z1) / 2
/** The altar, in the open in front of the temple, with a step on its west side for the priest. */
export const ALTAR = { x0: KREPIS.x1 + 4, x1: KREPIS.x1 + 6, z0: Math.floor(axis) - 3, z1: Math.ceil(axis) + 3 }

const inset = (x: number, z: number, box: { x0: number; x1: number; z0: number; z1: number }) =>
  Math.min(x - box.x0, box.x1 - x, z - box.z0, box.z1 - z)

function build() {
  const cells: PlanCell[] = []
  /** Raised earth inside the krepis, ready when the game starts, so the steps have a core. */
  const core: [number, number, number][] = []
  const add = (x: number, y: number, z: number, block: number, accept: number[], step: string, footing = false) =>
    cells.push({ x, y, z, block, accept, step, footing })
  const stone = [Block.limestone, Block.ashlar]
  const dressed = [Block.ashlar, Block.marble, Block.limestone]

  // 1. The boundary wall: two courses of limestone, with a gateway east and west where the road
  // passes. Each gateway has posts four blocks high and an ashlar lintel.
  for (let x = WALL.x0; x <= WALL.x1; x++) {
    for (let z = WALL.z0; z <= WALL.z1; z++) {
      if (inset(x, z, WALL) !== 0) continue
      const endWall = x === WALL.x0 || x === WALL.x1
      const opening = endWall && z >= GATE.z0 && z <= GATE.z1
      const post = endWall && (z === GATE.z0 - 1 || z === GATE.z1 + 1)
      for (let y = FLOOR; y < FLOOR + (post ? GATE.height : 2); y++) {
        if (!opening) add(x, y, z, Block.limestone, stone, 'peribolos', y === FLOOR)
      }
      if (endWall && z >= GATE.z0 - 1 && z <= GATE.z1 + 1) add(x, FLOOR + GATE.height, z, Block.ashlar, [Block.ashlar, Block.marble], 'peribolos')
    }
  }

  // 2. The altar: an ashlar block with a marble top, and a low step on its west side.
  for (let z = ALTAR.z0; z <= ALTAR.z1; z++) {
    for (let x = ALTAR.x0; x <= ALTAR.x1; x++) {
      add(x, FLOOR, z, Block.ashlar, [Block.ashlar, Block.marble], 'altar', true)
      add(x, FLOOR + 1, z, Block.marble, [Block.marble], 'altar')
    }
    add(ALTAR.x0 - 1, FLOOR, z, Block.ashlar, [Block.ashlar, Block.marble], 'altar', true)
  }

  // 3. The krepis: two steps round an earth core, then the stylobate. Its outer band, where the
  // columns stand, is marble; the floor inside the colonnade may be any dressed stone.
  for (let x = KREPIS.x0; x <= KREPIS.x1; x++) {
    for (let z = KREPIS.z0; z <= KREPIS.z1; z++) {
      const d = inset(x, z, KREPIS)
      if (d === 0) add(x, FLOOR, z, Block.ashlar, dressed, 'krepis', true)
      else core.push([x, FLOOR, z])
      if (d === 1) add(x, FLOOR + 1, z, Block.ashlar, dressed, 'krepis')
      else if (d > 1) core.push([x, FLOOR + 1, z])
      if (d === 2 || d === 3) add(x, FLOOR + 2, z, Block.marble, [Block.marble], 'krepis')
      else if (d > 3) add(x, FLOOR + 2, z, Block.ashlar, dressed, 'krepis')
    }
  }

  // 4. The cella: side and back walls as tall as the columns, a cross wall with a doorway, and the
  // side walls running on east to frame the porch (pronaos).
  for (let y = TEMPLE_FLOOR; y < TEMPLE_FLOOR + COLUMN_HEIGHT; y++) {
    for (let x = CELLA.x0; x <= CELLA.x1; x++) {
      for (const z of [CELLA.z0, CELLA.z1]) add(x, y, z, Block.ashlar, dressed, 'cella')
    }
    for (let z = CELLA.z0 + 1; z < CELLA.z1; z++) {
      add(CELLA.x0, y, z, Block.ashlar, dressed, 'cella')
      const doorway = Math.abs(z - (CELLA.z0 + CELLA.z1) / 2) < 1 && y < TEMPLE_FLOOR + 4
      if (!doorway) add(CELLA.door, y, z, Block.ashlar, dressed, 'cella')
    }
  }
  return { cells, core }
}

const built = build()
export const sanctuaryCells: readonly PlanCell[] = built.cells
export const sanctuaryCore: readonly [number, number, number][] = built.core
