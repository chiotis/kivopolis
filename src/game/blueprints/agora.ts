import { Block } from '../../voxel/blocks'
import { OY, bx, bz } from '../../voxel/grid'
import { area } from '../regions'
import type { PlanCell, PlanStep } from '../plans'

/**
 * The agora (Phase 14) as a voxel blueprint, built block by block like the theatre and the temple.
 * Block coordinates; north is -z. The stoa stands along the north side of the square and faces
 * south, as real stoas did, to catch the winter sun.
 *
 *   x 58 ─────────────────────────── 85   (the stoa, 28 blocks)
 *   z 180  ┌────────── back wall ──────────┐
 *          │ shop  │   shop   │   shop     │
 *   z 186  │──door──────door───────door────│
 *          │           the hall            │
 *   z 192  │ ▪▪  ▪▪  ▪▪  ▪▪  ▪▪  ▪▪  ▪▪    │  ← 7 columns, 2 × 2
 *   z 193  └───────────────────────────────┘
 *               the open square, marked by its boundary stones, to z 212
 */

export const AGORA_STEPS: readonly PlanStep[] = [
  { id: 'horoi', reward: 100 },
  { id: 'stoa', reward: 250 },
  { id: 'colonnade', reward: 250 },
  { id: 'shops', reward: 200 },
  { id: 'stoa-roof', reward: 300 },
  // Phase 14c: the spring, the pipe and the fountain house, then the market stalls.
  { id: 'krene', reward: 300 },
  { id: 'stalls', reward: 150 },
]

/** First course above the levelled ground. */
export const FLOOR = OY + Math.floor(area('agora').height * 2 + 0.25)
/** The stoa's footprint, its floor one course high. */
export const STOA = { x0: bx(-60) - 14, x1: bx(-60) + 13, z0: bz(-6), z1: bz(-6) + 13 }
/** Top of the floor: the first course of the walls and the columns. */
export const STOA_FLOOR = FLOOR + 1
/** The stoa's columns, and so its walls, are 9 blocks tall with the capital: lower than the temple's 11. */
export const COLUMN_HEIGHT = 9
/** The corner block of each of the 7 columns along the front, one block in from the floor's edge. */
export const COLUMNS: readonly [number, number][] = [0, 1, 2, 3, 4, 5, 6].map((i) => [STOA.x0 + 1 + i * 4, STOA.z1 - 2])
/** The shops' front wall, and the two walls between them, at the back of the hall. */
export const SHOPS = { front: STOA.z0 + 6, walls: [STOA.x0 + 9, STOA.x0 + 18], doors: [STOA.x0 + 4, STOA.x0 + 13, STOA.x0 + 22] }
/** The doorways, two blocks wide, are four high so a player walks through. */
export const DOOR_HEIGHT = 4
/** The end walls stop behind the colonnade. */
const END_WALL = STOA.z1 - 3
/** Architrave, frieze and cornice sit on the capitals and the walls. */
export const ENTABLATURE = STOA_FLOOR + COLUMN_HEIGHT
/** The roof's eaves rest on the cornice; it rises one block for every two towards the ridge. */
export const ROOF = ENTABLATURE + 3
export const roofHeight = (z: number) => ROOF + Math.floor(Math.min(z - STOA.z0, STOA.z1 - z) / 2)
/** The open square in front of the stoa, with a boundary stone at its corners and halfway along each side. */
export const SQUARE = { x0: STOA.x0, x1: STOA.x1, z0: STOA.z1 + 3, z1: STOA.z1 + 19 }
export const HOROI: readonly [number, number][] = [
  [SQUARE.x0, SQUARE.z0], [SQUARE.x1, SQUARE.z0],
  [SQUARE.x0, (SQUARE.z0 + SQUARE.z1) / 2], [SQUARE.x1, (SQUARE.z0 + SQUARE.z1) / 2],
  [SQUARE.x0, SQUARE.z1], [SQUARE.x1, SQUARE.z1],
]
/** The ground the generator levels for the stoa: two blocks round its floor. */
export const GROUND = { x0: STOA.x0 - 2, x1: STOA.x1 + 2, z0: STOA.z0 - 2, z1: STOA.z1 + 2, top: FLOOR - 1 }

function build() {
  const cells: PlanCell[] = []
  const add = (x: number, y: number, z: number, block: number, accept: number[], step: string, footing = false) =>
    cells.push({ x, y, z, block, accept, step, footing })
  const stone = [Block.limestone, Block.ashlar, Block.marble]
  const dressed = [Block.ashlar, Block.marble, Block.limestone]

  // 1. The boundary stones: limestone pillars with a marble cap, as on the road at the entrance.
  for (const [x, z] of HOROI) {
    add(x, FLOOR, z, Block.limestone, stone, 'horoi', true)
    add(x, FLOOR + 1, z, Block.limestone, stone, 'horoi')
    add(x, FLOOR + 2, z, Block.marble, [Block.marble], 'horoi')
  }

  // 2. The stoa's floor, ashlar at the edge and limestone inside, and its back and end walls.
  for (let x = STOA.x0; x <= STOA.x1; x++) {
    for (let z = STOA.z0; z <= STOA.z1; z++) {
      const edge = x === STOA.x0 || x === STOA.x1 || z === STOA.z0 || z === STOA.z1
      add(x, FLOOR, z, edge ? Block.ashlar : Block.limestone, edge ? dressed : stone, 'stoa', true)
    }
  }
  for (let y = STOA_FLOOR; y < ENTABLATURE; y++) {
    for (let x = STOA.x0; x <= STOA.x1; x++) add(x, y, STOA.z0, Block.ashlar, dressed, 'stoa')
    for (let z = STOA.z0 + 1; z <= END_WALL; z++) for (const x of [STOA.x0, STOA.x1]) add(x, y, z, Block.ashlar, dressed, 'stoa')
  }

  // 3. The colonnade: seven Doric columns, 2 × 2 blocks, eight drums high with a capital on top.
  for (const [cx, cz] of COLUMNS) {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      for (let y = STOA_FLOOR; y < ENTABLATURE - 1; y++) add(cx + dx, y, cz + dz, Block.columnDrum, [Block.columnDrum], 'colonnade')
      add(cx + dx, ENTABLATURE - 1, cz + dz, Block.capital, [Block.capital], 'colonnade')
    }
  }

  // 4. The shops: a wall across the back of the hall with a doorway into each, and two walls between them.
  for (let y = STOA_FLOOR; y < ENTABLATURE; y++) {
    for (let x = STOA.x0 + 1; x < STOA.x1; x++) {
      const doorway = SHOPS.doors.some((door) => x === door || x === door + 1) && y < STOA_FLOOR + DOOR_HEIGHT
      if (!doorway) add(x, y, SHOPS.front, Block.limestone, stone, 'shops')
    }
    for (const x of SHOPS.walls) for (let z = STOA.z0 + 1; z < SHOPS.front; z++) add(x, y, z, Block.limestone, stone, 'shops')
  }

  // 5. The entablature and the roof. Over the columns a marble architrave, a frieze with a triglyph
  // over every column and at the corners, and a cornice to the floor's edge; the walls rise three
  // more courses under the eaves. Then a terracotta roof in two slopes, closed by marble pediments.
  for (let x = STOA.x0; x <= STOA.x1; x++) {
    for (const z of [STOA.z1 - 2, STOA.z1 - 1]) {
      add(x, ENTABLATURE, z, Block.marble, [Block.marble], 'stoa-roof')
      if (z === STOA.z1 - 2) add(x, ENTABLATURE + 1, z, Block.marble, [Block.marble, Block.ashlar], 'stoa-roof')
      else {
        const corner = x === STOA.x0 || x === STOA.x1
        const triglyph = corner || Math.floor((x - STOA.x0 - 1) / 2) % 2 === 0
        add(x, ENTABLATURE + 1, z, triglyph ? Block.triglyph : Block.metope, [triglyph ? Block.triglyph : Block.metope], 'stoa-roof')
      }
    }
    for (const z of [STOA.z1 - 2, STOA.z1 - 1, STOA.z1]) add(x, ENTABLATURE + 2, z, Block.marble, [Block.marble], 'stoa-roof')
  }
  for (let y = ENTABLATURE; y < ROOF; y++) {
    for (let x = STOA.x0; x <= STOA.x1; x++) add(x, y, STOA.z0, Block.ashlar, dressed, 'stoa-roof')
    for (let z = STOA.z0 + 1; z <= END_WALL; z++) for (const x of [STOA.x0, STOA.x1]) add(x, y, z, Block.ashlar, dressed, 'stoa-roof')
  }
  for (let x = STOA.x0; x <= STOA.x1; x++) {
    for (let z = STOA.z0; z <= STOA.z1; z++) {
      add(x, roofHeight(z), z, Block.terracotta, [Block.terracotta], 'stoa-roof')
      if (x === STOA.x0 || x === STOA.x1) for (let y = ROOF; y < roofHeight(z); y++) add(x, y, z, Block.marble, [Block.marble, Block.ashlar], 'stoa-roof')
    }
  }
  return cells
}

export const agoraCells: readonly PlanCell[] = build()
