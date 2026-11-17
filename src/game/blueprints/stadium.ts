import { Block } from '../../voxel/blocks'
import { OY, bx, bz } from '../../voxel/grid'
import { area } from '../regions'
import type { PlanCell, PlanStep } from '../plans'

/**
 * The stadium (Phase 15) as a voxel blueprint, built block by block like the other buildings.
 * Block coordinates; the track runs along x down the valley floor, between the two hills.
 *
 *   x 200 ──────────────────────────────────────── 279   (the track, 80 blocks)
 *   z 260  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ north bank ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 *   z 268  ┃balbis                                balbis┃
 *          ┃            the track, packed sand         ┃   (8 blocks: four lanes)
 *   z 275  ┃                                           ┃
 *   z 278  ▄▄▄▄▄▄▄▄▄▄▄▄▄ south bank, judges' seats ▄▄▄▄▄▄▄▄▄
 *
 * The decided size: 40 × 4 units. The west end is left free for the vaulted entrance (15c) and the
 * east end for the turning posts.
 */

export const STADIUM_STEPS: readonly PlanStep[] = [
  { id: 'dromos', reward: 250 },
  { id: 'balbides', reward: 150 },
  { id: 'banks', reward: 250 },
  { id: 'hellanodikai', reward: 150 },
  // Phase 15c: the vaulted entrance, the turning posts, and the water channel with its basins.
  { id: 'krypte', reward: 250 },
  { id: 'kamptres', reward: 150 },
  { id: 'channel', reward: 300 },
]

/** First course above the valley floor; the track lies one lower, in the ground. */
export const FLOOR = OY + Math.floor(area('stadium').height * 2 + 0.25)
export const TRACK = { x0: bx(4), x1: bx(4) + 79, z0: bz(38), z1: bz(38) + 7, y: FLOOR - 1 }
/** The two starting lines, two blocks in from each end of the track. */
export const BALBIDES: readonly number[] = [TRACK.x0 + 2, TRACK.x1 - 2]
/** A walkway two blocks wide between the track and each bank. */
const WALK = 2
/** Each bank: a lower step and, behind it, a higher one, both 3 blocks deep, between the starting lines. */
export const BANK = { x0: BALBIDES[0], x1: BALBIDES[1], depth: 3 }
export const BANKS = {
  north: { near: TRACK.z0 - WALK - 1, side: -1 },
  south: { near: TRACK.z1 + WALK + 1, side: 1 },
} as const
/** The judges' seats in the middle of the south bank, as at Olympia: a marble floor, a bench and its back. */
export const JUDGES = { x0: bx(24) - 4, x1: bx(24) + 3 }
/** The ground the generator levels: the track and its walkways, clear of trees and stones. */
export const GROUND = { x0: TRACK.x0 - 2, x1: TRACK.x1 + 2, z0: TRACK.z0 - WALK, z1: TRACK.z1 + WALK, top: FLOOR - 1 }

function build() {
  const cells: PlanCell[] = []
  const add = (x: number, y: number, z: number, block: number, accept: number[], step: string, footing = false, open = false) =>
    cells.push({ x, y, z, block, accept, step, footing, open })
  const earth = [Block.grass, Block.soil]

  // 1. The track: packed sand laid in a bed one block deep, the whole length and width.
  // 2. The starting lines: a row of grooved stone sills across it near each end.
  for (let x = TRACK.x0; x <= TRACK.x1; x++) {
    for (let z = TRACK.z0; z <= TRACK.z1; z++) {
      if (BALBIDES.includes(x)) add(x, TRACK.y, z, Block.balbis, [Block.balbis], 'balbides', true)
      else add(x, TRACK.y, z, Block.sand, [Block.sand], 'dromos', true)
    }
  }

  // 3. The banks: earth heaped in two steps on each side, where the spectators sat on the grass.
  // 4. The judges' seats on the south bank: a marble floor on the upper step, a bench and a back.
  for (const { near, side } of Object.values(BANKS)) {
    for (let x = BANK.x0; x <= BANK.x1; x++) {
      for (let d = 0; d < BANK.depth * 2; d++) {
        const z = near + side * d
        const judges = side === 1 && x >= JUDGES.x0 && x <= JUDGES.x1 && d >= BANK.depth
        // Where the hill reaches over the bank, the generator cuts it back (open).
        add(x, FLOOR, z, Block.grass, earth, 'banks', true, true)
        if (d < BANK.depth) continue
        if (judges) add(x, FLOOR + 1, z, Block.marble, [Block.marble], 'hellanodikai')
        else add(x, FLOOR + 1, z, Block.grass, earth, 'banks', false, true)
        if (judges && d === BANK.depth * 2 - 2) add(x, FLOOR + 2, z, Block.marble, [Block.marble], 'hellanodikai')
        if (judges && d === BANK.depth * 2 - 1) for (const y of [FLOOR + 2, FLOOR + 3]) add(x, y, z, Block.marble, [Block.marble], 'hellanodikai')
      }
    }
  }
  return cells
}

export const stadiumCells: readonly PlanCell[] = build()
