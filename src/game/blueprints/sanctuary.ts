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
/** Where the 16 columns stand: the corner block of each 2 × 2 column, one block in from the stylobate's edge. */
export const COLUMNS: readonly [number, number][] = (() => {
  const xs = [0, 1, 2, 3, 4, 5].map((i) => STYLOBATE.x0 + 1 + i * 4)
  const zs = [0, 1, 2, 3].map((i) => STYLOBATE.z0 + 1 + i * 4)
  const list: [number, number][] = []
  for (const x of xs) for (const z of zs) if (x === xs[0] || x === xs.at(-1) || z === zs[0] || z === zs.at(-1)) list.push([x, z])
  return list
})()
/** The entablature's three courses (architrave, frieze, cornice) sit on the capitals. */
export const ENTABLATURE = TEMPLE_FLOOR + COLUMN_HEIGHT
/** The ring the columns stand on and the architrave and frieze cover. */
const RING = { x0: STYLOBATE.x0 + 1, x1: STYLOBATE.x1 - 1, z0: STYLOBATE.z0 + 1, z1: STYLOBATE.z1 - 1 }
/** The roof's eaves rest on the cornice; it rises one block for every two towards the ridge. */
export const ROOF = ENTABLATURE + 3
export const roofHeight = (z: number) => ROOF + Math.floor(Math.min(z - STYLOBATE.z0, STYLOBATE.z1 - z) / 2)
/** The cult statue stands on its base at the west end of the cella, facing the door. */
export const STATUE = { x0: CELLA.x0 + 2, x1: CELLA.x0 + 3, z0: Math.floor((CELLA.z0 + CELLA.z1) / 2) - 2, z1: Math.floor((CELLA.z0 + CELLA.z1) / 2) + 2 }
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

  // 3. The krepis: two steps round an earth core, then the stylobate. Its outer band, three blocks
  // wide, is marble: the columns stand on it, one block in from the edge. The floor inside the
  // colonnade may be any dressed stone.
  for (let x = KREPIS.x0; x <= KREPIS.x1; x++) {
    for (let z = KREPIS.z0; z <= KREPIS.z1; z++) {
      const d = inset(x, z, KREPIS)
      if (d === 0) add(x, FLOOR, z, Block.ashlar, dressed, 'krepis', true)
      else core.push([x, FLOOR, z])
      if (d === 1) add(x, FLOOR + 1, z, Block.ashlar, dressed, 'krepis')
      else if (d > 1) core.push([x, FLOOR + 1, z])
      if (d >= 2 && d <= 4) add(x, FLOOR + 2, z, Block.marble, [Block.marble], 'krepis')
      else if (d > 4) add(x, FLOOR + 2, z, Block.ashlar, dressed, 'krepis')
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
  // 5. The columns: sixteen of them, 2 × 2 blocks, ten drums high with a capital on top.
  for (const [cx, cz] of COLUMNS) {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      for (let y = TEMPLE_FLOOR; y < TEMPLE_FLOOR + COLUMN_HEIGHT - 1; y++) add(cx + dx, y, cz + dz, Block.columnDrum, [Block.columnDrum], 'columns')
      add(cx + dx, TEMPLE_FLOOR + COLUMN_HEIGHT - 1, cz + dz, Block.capital, [Block.capital], 'columns')
    }
  }

  // 6. The entablature: a marble architrave over the columns, the frieze of triglyphs and metopes
  // (a triglyph over every column and between them, two blocks each), and a cornice that reaches
  // out to the stylobate's edge.
  for (let x = STYLOBATE.x0; x <= STYLOBATE.x1; x++) {
    for (let z = STYLOBATE.z0; z <= STYLOBATE.z1; z++) {
      const ring = inset(x, z, RING)
      if (ring === 0 || ring === 1) {
        add(x, ENTABLATURE, z, Block.marble, [Block.marble], 'entablature')
        if (ring === 1) add(x, ENTABLATURE + 1, z, Block.marble, [Block.marble, Block.ashlar], 'entablature')
        else {
          // Along the long sides count blocks in x, along the ends in z; corners take a triglyph.
          const along = z === RING.z0 || z === RING.z1 ? x - RING.x0 : z - RING.z0
          const triglyph = Math.floor(along / 2) % 2 === 0
          add(x, ENTABLATURE + 1, z, triglyph ? Block.triglyph : Block.metope, [triglyph ? Block.triglyph : Block.metope], 'entablature')
        }
      }
      if (inset(x, z, STYLOBATE) <= 1) add(x, ENTABLATURE + 2, z, Block.marble, [Block.marble], 'entablature')
    }
  }

  // 7. The roof: terracotta tiles in two slopes to a ridge along the temple, and a marble pediment
  // (the triangular gable) closing each end under them.
  for (let x = STYLOBATE.x0; x <= STYLOBATE.x1; x++) {
    for (let z = STYLOBATE.z0; z <= STYLOBATE.z1; z++) {
      add(x, roofHeight(z), z, Block.terracotta, [Block.terracotta], 'roof')
      if (x === STYLOBATE.x0 || x === STYLOBATE.x1) {
        for (let y = ROOF; y < roofHeight(z); y++) add(x, y, z, Block.marble, [Block.marble, Block.ashlar], 'roof')
      }
    }
  }

  // 8. The cult statue of Dionysus: a bronze figure built block by block on a marble base, with
  // his staff, the thyrsus, in his right hand. He faces the door, to the east.
  const base = TEMPLE_FLOOR, foot = TEMPLE_FLOOR + 1
  const mid = Math.floor((CELLA.z0 + CELLA.z1) / 2)
  for (let x = STATUE.x0; x <= STATUE.x1; x++) {
    for (let z = STATUE.z0; z <= STATUE.z1; z++) add(x, base, z, Block.statueBase, [Block.statueBase], 'statue')
    // Legs, robed body and head: two blocks wide and deep, six high.
    for (const z of [mid, mid + 1]) for (let y = foot; y <= foot + 5; y++) add(x, y, z, Block.bronze, [Block.bronze], 'statue')
  }
  // His left arm at the shoulder, and in his right hand the thyrsus, a staff taller than he is.
  for (const y of [foot + 3, foot + 4]) add(STATUE.x1, y, mid - 1, Block.bronze, [Block.bronze], 'statue')
  for (let y = foot; y <= foot + 6; y++) add(STATUE.x1, y, mid + 2, Block.bronze, [Block.bronze], 'statue')
  return { cells, core }
}

const built = build()
export const sanctuaryCells: readonly PlanCell[] = built.cells
export const sanctuaryCore: readonly [number, number, number][] = built.core
