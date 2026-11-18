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
/** The vaulted entrance at the west end, in line with the road: walls, a stepped arch of vault stones and earth on top. */
export const KRYPTE = { x0: TRACK.x0 - 8, x1: TRACK.x0 - 1, z0: TRACK.z0 + 1, z1: TRACK.z1 - 1, y: FLOOR }
/** Four turning posts just beyond the east end of the track, one for each lane. */
export const KAMPTRES: readonly number[] = [TRACK.z0, TRACK.z0 + 2, TRACK.z1 - 2, TRACK.z1]
export const KAMPTER_X = TRACK.x1 + 1
/**
 * The water channel along the north side of the track: water flush with the ground at `z`, on a
 * stone bed, with a stone kerb on the bank side. Lion's heads set in the kerb pour into it every 14
 * blocks, since flowing water runs 7 blocks from a source; a pipe under the kerb feeds them all.
 */
export const CHANNEL = { x0: BANK.x0, x1: BANK.x1, z: TRACK.z0 - 1, kerb: TRACK.z0 - 2, y: FLOOR - 1 }
export const SPOUTS: readonly number[] = [0, 1, 2, 3, 4, 5].map((i) => CHANNEL.x0 + 3 + i * 14)
/** The second spring, on the north hill at the west end, beside the road down from the theatre. */
export const SPRING = { x0: TRACK.x0 + 1, x1: TRACK.x0 + 2, z0: bz(30), z1: bz(30) + 1, y: 17 }
/**
 * The pipe: down the slope west of the north bank (so a finished bank need not be dug up), then
 * east under the kerb past every lion's head. The ground under the slope's run is kept as data,
 * checked against the terrain by a test, as for the agora's pipe.
 */
export const SLOPE_GROUND: readonly number[] = [17, 17, 16, 16, 16, 16, 16, 16, 16, 16, 16]
export const pipeCells: readonly [number, number, number][] = (() => {
  const x = SPRING.x0, cells: [number, number, number][] = [[x, SPRING.y, SPRING.z1 + 1]]
  SLOPE_GROUND.forEach((y, i) => {
    const z = SPRING.z1 + 2 + i
    const [, ly, lz] = cells.at(-1)!
    for (let k = y; k < ly; k++) cells.push([x, k, lz])
    cells.push([x, y, z])
  })
  // Down under the kerb, then east to the last lion's head.
  const [, ly, lz] = cells.at(-1)!
  for (let k = CHANNEL.y - 1; k < ly; k++) cells.push([x, k, lz])
  for (let px = x; px <= SPOUTS.at(-1)!; px++) cells.push([px, CHANNEL.y - 1, CHANNEL.kerb])
  return cells
})()
export const springCells: readonly [number, number, number][] = [
  [SPRING.x0, SPRING.y, SPRING.z0], [SPRING.x1, SPRING.y, SPRING.z0], [SPRING.x0, SPRING.y, SPRING.z1], [SPRING.x1, SPRING.y, SPRING.z1],
]

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
  // 5. The vaulted entrance: ashlar walls three courses high, a stepped arch of vault stones, and
  // earth heaped over it, so the athletes walked in under the bank.
  for (let x = KRYPTE.x0; x <= KRYPTE.x1; x++) {
    for (let y = KRYPTE.y; y < KRYPTE.y + 3; y++) for (const z of [KRYPTE.z0, KRYPTE.z1]) add(x, y, z, Block.ashlar, [Block.ashlar, Block.limestone], 'krypte', y === KRYPTE.y)
    for (const z of [KRYPTE.z0, KRYPTE.z0 + 1, KRYPTE.z1 - 1, KRYPTE.z1]) add(x, KRYPTE.y + 3, z, Block.voussoir, [Block.voussoir], 'krypte')
    for (let z = KRYPTE.z0 + 1; z <= KRYPTE.z1 - 1; z++) add(x, KRYPTE.y + 4, z, Block.voussoir, [Block.voussoir], 'krypte')
    for (let z = KRYPTE.z0; z <= KRYPTE.z1; z++) add(x, KRYPTE.y + 5, z, Block.grass, earth, 'krypte')
  }

  // 6. The turning posts: an ashlar base and a marble shaft beyond the east end of each lane.
  for (const z of KAMPTRES) {
    add(KAMPTER_X, FLOOR, z, Block.ashlar, [Block.ashlar, Block.limestone], 'kamptres', true)
    for (const y of [FLOOR + 1, FLOOR + 2]) add(KAMPTER_X, y, z, Block.marble, [Block.marble], 'kamptres')
  }

  // 7. The water: the pipe from the spring, the stone bed and kerb with the lion's heads, and the
  // channel itself, which counts once the water runs in it.
  for (const [x, y, z] of pipeCells) cells.push({ x, y, z, block: Block.pipe, accept: [Block.pipe], step: 'channel', open: true })
  for (let x = CHANNEL.x0 - 1; x <= CHANNEL.x1 + 1; x++) {
    const end = x < CHANNEL.x0 || x > CHANNEL.x1
    if (end) { add(x, CHANNEL.y, CHANNEL.z, Block.ashlar, [Block.ashlar, Block.limestone], 'channel', true); continue }
    add(x, CHANNEL.y - 1, CHANNEL.z, Block.ashlar, [Block.ashlar, Block.limestone], 'channel', true)
    cells.push({ x, y: CHANNEL.y, z: CHANNEL.z, block: Block.water, accept: [Block.water, ...WATER_LEVELS], step: 'channel' })
    const spout = SPOUTS.includes(x)
    add(x, CHANNEL.y, CHANNEL.kerb, spout ? Block.lionSpout : Block.ashlar, spout ? [Block.lionSpout] : [Block.ashlar, Block.limestone], 'channel', true)
  }
  add(CHANNEL.x0 - 1, CHANNEL.y, CHANNEL.kerb, Block.ashlar, [Block.ashlar, Block.limestone], 'channel')

  // A course only stands on the ground where no other cell of the plan is under it.
  const taken = new Set(cells.map(({ x, y, z }) => `${x},${y},${z}`))
  for (const cell of cells) if (cell.footing && taken.has(`${cell.x},${cell.y - 1},${cell.z}`)) cell.footing = false
  return cells
}

/** Flowing water at every level: the channel counts as soon as water runs in it. */
const WATER_LEVELS = [Block.flow1, Block.flow2, Block.flow3, Block.flow4, Block.flow5, Block.flow6, Block.flow7]

export const stadiumCells: readonly PlanCell[] = build()
