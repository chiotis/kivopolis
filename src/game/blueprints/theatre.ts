import { Block } from '../../voxel/blocks'
import { OX, OY, OZ, S, bx, bz, wx, wz } from '../../voxel/grid'
import { ground } from '../terrain'
import { ANALEMMA_ANGLE, DIAZOMA, KOILON_EDGE, SEAT_EDGE, TERRACE_START, inAisle, objectives, rowRadii, rowTerraces, terraceOf, type Mission } from '../theatre'

/**
 * The theatre as a voxel blueprint: every block the player places by hand, in first person.
 * There are no prefab pieces. A cell counts as built when the world holds one of its accepted blocks.
 */
export interface Cell {
  x: number
  y: number
  z: number
  /** The block the ghost guide shows. */
  block: number
  /** Blocks that complete the cell (the shown block first). */
  accept: number[]
  mission: Exclude<Mission, 'discover'>
  /** The lowest course of a structure: the generator gives it solid ground underneath. */
  footing?: boolean
  /** The prefab slot this cell replaces, for migrating saves made before Phase 5. */
  legacy: string
}

const stone = [Block.limestone, Block.ashlar, Block.marble]
const dressed = [Block.ashlar, Block.marble]

/** Polar angle as the old theatre used it: zero points uphill (-Z), positive towards +X. */
const angleOf = (x: number, z: number) => Math.atan2(x, -z)
const center = (i: number, origin: number) => (i - origin) * S + S / 2
const SECTORS = [-0.88, 0, 0.88]

function seatLegacy(row: number, angle: number) {
  const sector = SECTORS.reduce((best, c, i) => Math.abs(angle - c) < Math.abs(angle - SECTORS[best]) ? i : best, 0)
  const seat = Math.max(0, Math.min(3, Math.floor((angle - SECTORS[sector] + 0.388) / 0.194)))
  return `seat-${row}-${sector}-${seat}`
}

function build(): Cell[] {
  const cells: Cell[] = []
  const add = (cell: Cell) => cells.push(cell)

  // Analemmata: two retaining walls close the koilon at its sides. Each column rises from the
  // ground outside the theatre to one course above the seats of its terrace.
  const walls = new Map<string, { ix: number; iz: number; side: string; terrace: number }>()
  for (const side of [-1, 1]) {
    for (let r = TERRACE_START; r < KOILON_EDGE; r += 0.1) {
      const ix = bx(side * r * Math.sin(ANALEMMA_ANGLE)), iz = bz(-r * Math.cos(ANALEMMA_ANGLE))
      const terrace = terraceOf(Math.hypot(center(ix, OX), center(iz, OZ)))
      const key = `${ix},${iz}`
      walls.set(key, { ix, iz, side: side < 0 ? 'left' : 'right', terrace: Math.max(terrace, walls.get(key)?.terrace ?? 0) })
    }
  }
  for (const { ix, iz, side, terrace } of walls.values()) {
    // The same rounding the generator uses, so the bottom course sits on the ground.
    const floor = OY + Math.floor(ground(center(ix, OX), center(iz, OZ)) * 2 + 0.25)
    for (let y = Math.min(floor, OY + terrace - 1); y <= OY + terrace + 1; y++) {
      add({ x: ix, y, z: iz, block: Block.ashlar, accept: [Block.ashlar, Block.limestone], mission: 'analemmata', footing: y === Math.min(floor, OY + terrace - 1), legacy: `analemma-${side}` })
    }
  }

  // Scan the bowl once: orchestra ring, seats and aisle stairs all follow the circle around the origin.
  for (let ix = bx(-KOILON_EDGE); ix <= bx(KOILON_EDGE); ix++) {
    for (let iz = bz(-KOILON_EDGE); iz <= bz(4); iz++) {
      const px = center(ix, OX), pz = center(iz, OZ)
      const r = Math.hypot(px, pz)
      const angle = angleOf(px, pz)
      if (walls.has(`${ix},${iz}`)) continue

      // Orchestra: a flush ring of dressed stone set into the excavated trench.
      if (r >= 2.95 && r < 3.5) {
        const wedge = Math.floor((((-angle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 3))
        add({ x: ix, y: OY - 1, z: iz, block: Block.ashlar, accept: dressed, mission: 'orchestra', legacy: `rim-${wedge}` })
      }

      // Stairs: fill the aisle trenches so each step lands flush with its terrace.
      // They run through the diazoma too, where the top step lies flush with the walkway.
      if (r >= 4.18 && r < KOILON_EDGE && inAisle(angle)) {
        const terrace = terraceOf(r)
        const sector = angle < 0 ? 0 : 1
        add({ x: ix, y: OY + terrace - 1, z: iz, block: Block.limestone, accept: stone, mission: 'stairs', footing: true, legacy: `step-${sector}-${terrace}` })
        continue
      }

      // Diazoma: a level walkway of gravel, flush with its terrace, from wall to wall.
      if (terraceOf(r) === DIAZOMA && r >= TERRACE_START && Math.abs(angle) < ANALEMMA_ANGLE) {
        add({ x: ix, y: OY + DIAZOMA - 1, z: iz, block: Block.gravel, accept: [Block.gravel], mission: 'diazoma', footing: true, legacy: 'diazoma' })
        continue
      }

      // Seats: one block high, one block deep, following each curved row on its terrace.
      // The two rows below the diazoma make the lower tier; the two above it, the upper tier.
      if (Math.abs(angle) > SEAT_EDGE || inAisle(angle)) continue
      rowRadii.forEach((radius, row) => {
        if (Math.abs(r - radius) >= 0.31) return
        // The front row is the prohedria: marble seats of honour.
        const front = row === 0
        const terrace = rowTerraces[row]
        add({
          x: ix, y: OY + terrace, z: iz, block: front ? Block.marble : Block.limestone,
          accept: front ? [Block.marble] : stone, mission: row < 2 ? 'seats' : 'koilon', footing: true, legacy: seatLegacy(row, angle),
        })
      })
    }
  }

  // The thymele: a small altar base in the middle of the orchestra.
  for (const ix of [OX - 1, OX]) for (const iz of [OZ - 1, OZ]) {
    add({ x: ix, y: OY, z: iz, block: Block.ashlar, accept: dressed, mission: 'orchestra', legacy: 'floor-0' })
  }

  // Skene: a raised platform, a back wall with a central doorway, two log posts and a tiled roof.
  const x0 = bx(-2.5), x1 = bx(2.5) - 1, z0 = bz(4), z1 = bz(6) - 1
  const side = (ix: number) => wx(ix) + S / 2 < 0 ? 'left' : 'right'
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      add({ x: ix, y: OY, z: iz, block: Block.ashlar, accept: [Block.ashlar, Block.limestone], mission: 'skene', footing: true, legacy: `foundation-${side(ix)}` })
      add({ x: ix, y: OY + 5, z: iz, block: Block.terracotta, accept: [Block.terracotta], mission: 'skene', legacy: 'roof' })
    }
    const third = ix - x0 < 3 ? 'left' : x1 - ix < 3 ? 'right' : 'middle'
    for (let layer = 1; layer <= 4; layer++) {
      const doorway = (ix === OX - 1 || ix === OX) && layer <= 3
      if (!doorway) add({ x: ix, y: OY + layer, z: z1, block: Block.ashlar, accept: [Block.ashlar, Block.limestone], mission: 'skene', legacy: `wall-${third}` })
    }
  }
  for (const ix of [x0, x1]) {
    for (let layer = 1; layer <= 4; layer++) {
      add({ x: ix, y: OY + layer, z: z0, block: Block.oliveLog, accept: [Block.oliveLog], mission: 'skene', legacy: `post-${side(ix)}` })
    }
  }

  // Parodoi: two stone gateways over the side paths, with the passage running towards the orchestra.
  for (const [x, label] of [[-5.1, 'left'], [5.1, 'right']] as const) {
    const ix = bx(x), iz = bz(2.4 + Math.sin(x * 0.27) * 0.8)
    for (const dz of [-2, 2]) {
      for (let layer = 0; layer < 4; layer++) {
        add({ x: ix, y: OY + layer, z: iz + dz, block: Block.ashlar, accept: [Block.ashlar, Block.marble], mission: 'finish', footing: layer === 0, legacy: `gate-${label}` })
      }
    }
    for (let dz = -2; dz <= 2; dz++) {
      add({ x: ix, y: OY + 4, z: iz + dz, block: Block.marble, accept: [Block.marble], mission: 'finish', legacy: `gate-${label}` })
    }
  }

  return cells
}

export const cells: readonly Cell[] = build()
export const missionCells = (mission: Mission) => cells.filter((cell) => cell.mission === mission)
export const cellTotals = Object.fromEntries(
  objectives.map(({ id }) => [id, missionCells(id).length]),
) as Record<Mission, number>

/** The old prefab slot ids, per mission, so an old save that finished a mission fills all of its cells. */
const prefabSeats = [0, 1, 2].flatMap((sector) => [0, 1, 2, 3].map((seat) => `seat-0-${sector}-${seat}`))
const prefabKoilon = [1, 2].flatMap((row) => [0, 1, 2].flatMap((sector) => [0, 1, 2, 3].map((seat) => `seat-${row}-${sector}-${seat}`)))
// The analemmata and the diazoma had no prefab pieces: an old save that finished the next
// step (the seats, the koilon) gets them too.
export const legacySlots: Record<Exclude<Mission, 'discover'>, string[]> = {
  orchestra: [...Array.from({ length: 6 }, (_, i) => `rim-${i}`), 'floor-0', 'floor-1', 'floor-2'],
  analemmata: prefabSeats,
  seats: prefabSeats,
  diazoma: prefabKoilon,
  koilon: prefabKoilon,
  stairs: [0, 1].flatMap((sector) => [0, 1, 2].map((row) => `step-${sector}-${row}`)),
  skene: ['foundation-left', 'foundation-right', 'wall-left', 'wall-middle', 'wall-right', 'post-left', 'post-right', 'roof'],
  finish: ['gate-left', 'gate-right'],
}
