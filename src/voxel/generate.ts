import { ground, islandEdge, streamBed } from '../game/terrain'
import { AREAS, ROADS, ROAD_WIDTH, RIDGE, STREAM, STREAM_WIDTH, areaWeight, bridges, farFrom, nearest, onRoad, oreHill, roadDistance, type Point2 } from '../game/regions'
import { KOILON_EDGE, parodosZ, siteMarker, spawn, tourMarker } from '../game/theatre'
import { cells } from '../game/blueprints/theatre'
import { Block } from './blocks'
import { OY, S, SEA_FLOOR_Y, SEA_Y, SX, SY, SZ, bx, bz, wx, wz } from './grid'

/** The subset of VoxelWorld the generator needs (avoids an import cycle). */
export interface Grid {
  get(x: number, y: number, z: number): number
  fill(x: number, y: number, z: number, id: number): void
}

function random(seed: number) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/** Island seed, stored in the save header. 0 is the hand-designed island. */
export const SEED = 0

function hash(x: number, z: number, salt = 0) {
  let h = (x * 374761393 + z * 668265263 + (salt + SEED * 101) * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** The worn paths of the theatre valley, and the ancient road that leads on to the other areas. */
export function onPath(x: number, z: number) {
  return (Math.abs(x - (6.2 + Math.sin(z * 0.29) * 1.45)) < 1.0 && z > 3.5 && z < 23)
    || (Math.hypot(x, z) > 12 && onRoad(x, z))
    || (Math.abs(z - parodosZ(x)) < 0.73 && Math.abs(x) > 3.5 && Math.abs(x) < 12.8)
    || Math.hypot(x, z) < 3.7
}

/**
 * Converts the design heightfield into block levels. The +0.25 bias keeps the theatre's
 * 0.5-unit tiers on exact block tops and its aisles one block lower.
 */
export const level = (height: number) => Math.floor(height * 2 + 0.25)

export const groves: [number, number, number, 'olive' | 'cypress'][] = [
  [-12.8, -3.7, 1.10, 'olive'], [-11.4, -7.6, 1.2, 'olive'], [-12.5, -9.9, 1.35, 'cypress'],
  [-14.4, -4.8, 0.98, 'olive'], [-13.7, 1.9, 1.15, 'cypress'], [-16.8, -1, 1.2, 'olive'],
  [-9.4, -8.5, 1.0, 'cypress'], [-8.3, -10.4, 1.17, 'cypress'], [-5.0, -13.4, 1.09, 'olive'],
  [2.7, -12.5, 1.2, 'cypress'], [4.9, -11.4, 1.0, 'cypress'], [8.1, -10.7, 1.25, 'olive'],
  [10.8, -11.1, 0.97, 'olive'], [13.4, -8.9, 1.30, 'cypress'], [15.9, -8.1, 0.95, 'cypress'],
  [12.4, -4.4, 1.05, 'cypress'], [13.6, -1.4, 1.24, 'olive'], [16.1, 2.8, 1.25, 'olive'],
  [15.2, 6.2, 1.1, 'cypress'], [14.4, 9, 1.1, 'olive'], [8.6, 10.4, 0.93, 'olive'],
  [3.8, 10.2, 0.9, 'cypress'], [2.3, 11.8, 0.8, 'cypress'], [-3.9, 12.1, 1.05, 'olive'],
  [-8.2, 10.4, 1.06, 'cypress'], [-13.2, 10.4, 1.1, 'olive'], [-17.3, 11.5, 0.98, 'cypress'],
  [-21.2, 1.5, 0.86, 'olive'], [-19.7, -12.5, 1.1, 'olive'], [-17.5, -16, 1.1, 'cypress'],
  [-15, -19, 1.32, 'olive'], [-11.1, -18.9, 1.2, 'cypress'], [-4.4, -19, 1.24, 'cypress'],
  [5.1, -18.1, 1.05, 'olive'], [9.0, -15.7, 0.8, 'olive'], [16.8, -12.5, 1.17, 'cypress'],
]

/**
 * The marble quarry: a bright outcrop on the northern ridge, just behind the top of the koilon.
 * Its marble starts at the surface and runs six blocks deep, enough for every seat row, both
 * stairways and the gateway lintels, with plenty to spare.
 */
export const QUARRY = { x: -0.5, z: -15.6, rx: 4, rz: 2.3, depth: 6 }
export function inQuarry(x: number, z: number) {
  const d = ((x - QUARRY.x) / QUARRY.rx) ** 2 + ((z - QUARRY.z) / QUARRY.rz) ** 2
  // A ragged rim, so the outcrop reads as broken rock rather than a painted ellipse.
  return d < 1 - 0.22 * hash(bx(x) >> 1, bz(z) >> 1, 23)
}

/** Copper is commoner than tin, as in the real Bronze Age trade. Ores cluster in small pockets. */
function ore(x: number, y: number, z: number, chance: number) {
  const pocket = hash(x >> 1, z >> 1, y >> 1)
  if (pocket < chance) return Block.copperOre
  if (pocket > 1 - chance * 0.45) return Block.tinOre
  return null
}

function terrain(grid: Grid) {
  for (let x = 0; x < SX; x++) {
    for (let z = 0; z < SZ; z++) {
      const px = wx(x) + S / 2, pz = wz(z) + S / 2
      const height = ground(px, pz)
      const radius = Math.hypot(px, pz)
      const edge = islandEdge(Math.atan2(px, -pz))
      // Past the shore the sea floor drops to swimming depth, then levels out.
      const shelf = radius > edge ? Math.max(SEA_FLOOR_Y, SEA_Y - 2 - Math.floor((radius - edge) * 3)) : SY
      const top = Math.max(1, Math.min(SY - 2, shelf, OY + level(height) - 1))
      const beach = height < -0.2 || radius > edge - 2.2
      const ridge = pz < -12 && pz > -19.5 && Math.abs(px) < 19 && hash(x, z, 3) > 0.35
      // The ore hill is mostly bare rock, with about three times the usual copper and tin.
      const mine = oreHill(px, pz) > 0.3
      const rocky = height > 3.2 && hash(x, z, 5) > (mine ? 0.15 : 0.55)
      // Pale marble breaks the surface on the northern ridge; clay lies under the beaches.
      const marbleVein = pz < -11 && Math.abs(px) < 20 && hash(x >> 2, z >> 2, 21) > 0.62
      const clayBed = beach && hash(x >> 1, z >> 1, 17) > 0.5
      const quarry = !beach && inQuarry(px, pz)
      // The stream: a gravel bed with one block of still water on it, away from the theatre valley.
      const stream = radius > 20 && !beach && !farFrom(STREAM, px, pz, STREAM_WIDTH.water) ? streamBed(px, pz) : null
      const brook = stream !== null && stream.distance < STREAM_WIDTH.water
      for (let y = 0; y <= top; y++) {
        let id: number = top - y >= 3 ? Block.limestone : Block.soil
        if (y === 0) id = Block.bedrock
        else if (quarry && top - y < QUARRY.depth) id = Block.marble
        else if (y === top) {
          if (beach) id = clayBed && hash(x, z, 19) > 0.8 ? Block.clay : Block.sand
          else if (brook) id = Block.gravel
          else if (onPath(px, pz)) id = Block.path
          else if (marbleVein && (ridge || rocky)) id = Block.marble
          else if (ridge || rocky) id = hash(x, z, 9) > 0.7 ? Block.gravel : ore(x, y, z, mine ? 0.09 : 0.03) ?? Block.limestone
          else id = Block.grass
        } else if (beach && top - y < 2) id = Block.sand
        else if (clayBed && top - y < 4) id = Block.clay
        else if (id === Block.limestone) id = (marbleVein && top - y < 7 ? Block.marble : null) ?? ore(x, y, z, mine ? 0.06 : 0.022) ?? Block.limestone
        grid.fill(x, y, z, id)
      }
      if (brook && top + 1 < SY) grid.fill(x, top + 1, z, Block.water)
    }
  }
}

/** Index of the highest solid block in a column. */
function topOf(grid: Grid, x: number, z: number) {
  for (let y = SY - 1; y > 0; y--) if (grid.get(x, y, z) !== Block.air) return y
  return 0
}

function setIfAir(grid: Grid, x: number, y: number, z: number, id: number) {
  if (grid.get(x, y, z) === Block.air) grid.fill(x, y, z, id)
}

/**
 * Groves on the new land: thick along the wooded ridge, scattered elsewhere, and never on a
 * building area, the road or the stream.
 */
export function wildGroves(): [number, number, number, 'olive' | 'cypress'][] {
  const result: [number, number, number, 'olive' | 'cypress'][] = []
  const step = 5.5
  for (let gx = -90; gx <= 90; gx += step) {
    for (let gz = -90; gz <= 90; gz += step) {
      const cx = Math.round(gx / step), cz = Math.round(gz / step)
      const x = gx + (hash(cx, cz, 31) - 0.5) * step * 0.8, z = gz + (hash(cx, cz, 37) - 0.5) * step * 0.8
      const radius = Math.hypot(x, z)
      if (radius < 25 || radius > islandEdge(Math.atan2(x, -z)) - 7 || ground(x, z) < 0.4) continue
      if (AREAS.some((item) => areaWeight(item, x, z) > 0.02) || roadDistance(x, z) < 2.6) continue
      if (nearest(STREAM, x, z).distance < STREAM_WIDTH.cut + 1.5 || oreHill(x, z) > 0.3) continue
      const wooded = nearest(RIDGE.line, x, z).distance < 7
      if (hash(cx, cz, 41) > (wooded ? 0.85 : 0.24)) continue
      result.push([x, z, 0.85 + hash(cx, cz, 43) * 0.45, hash(cx, cz, 47) > (wooded ? 0.35 : 0.6) ? 'cypress' : 'olive'])
    }
  }
  return result
}

function trees(grid: Grid) {
  for (const [x, z, size, kind] of [...groves, ...wildGroves()]) {
    const ix = bx(x), iz = bz(z)
    const base = topOf(grid, ix, iz) + 1
    if (kind === 'olive') {
      const trunk = 5 + (size > 1.15 ? 1 : 0)
      for (let y = 0; y < trunk; y++) grid.fill(ix, base + y, iz, Block.oliveLog)
      const rx = 2 + Math.round(size), ry = 2, cy = base + trunk + 1
      for (let dx = -rx; dx <= rx; dx++) {
        for (let dy = -ry; dy <= ry; dy++) {
          for (let dz = -rx; dz <= rx; dz++) {
            const d = (dx / (rx + 0.4)) ** 2 + (dy / (ry + 0.4)) ** 2 + (dz / (rx + 0.4)) ** 2
            if (d > 1 || hash(ix + dx, iz + dz, cy + dy) < 0.1) continue
            setIfAir(grid, ix + dx, cy + dy, iz + dz, Block.oliveLeaves)
          }
        }
      }
      // A couple of branches reaching into the crown.
      grid.fill(ix + 1, base + trunk, iz, Block.oliveLog)
      grid.fill(ix - 1, base + trunk - 1 + (size > 1 ? 1 : 0), iz + 1, Block.oliveLog)
    } else {
      const height = Math.round(9 + size * 3)
      for (let y = 0; y < 4; y++) grid.fill(ix, base + y, iz, Block.oliveLog)
      for (let y = 4; y < height; y++) {
        grid.fill(ix, base + y, iz, Block.cypressLeaves)
        if (y < height - 3) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) setIfAir(grid, ix + dx, base + y, iz + dz, Block.cypressLeaves)
        }
      }
      grid.fill(ix, base + height, iz, Block.cypressLeaves)
    }
  }
}

/** Fills a solid footing under a structure so it never floats on uneven ground. */
function footing(grid: Grid, x: number, z: number, top: number, id: number) {
  for (let y = topOf(grid, x, z) + 1; y <= top; y++) grid.fill(x, y, z, id)
}

function ruins(grid: Grid) {
  for (const [x, z, length, standing] of [[-10.2, 5.2, 4.1, 2], [12.9, -6.6, 4.6, 3], [-13.2, -11, 3.3, 2]]) {
    const floor = topOf(grid, bx(x), bz(z)) + 1
    for (let ix = bx(x - length / 2); ix <= bx(x + length / 2); ix++) {
      for (let iz = bz(z - 1.05); iz <= bz(z + 1.05); iz++) footing(grid, ix, iz, floor, Block.ashlar)
    }
    for (let i = 0; i < standing; i++) {
      const cx = bx(x + (i - (standing - 1) / 2) * 1.12), cz = bz(z - 0.42)
      const courses = i === 1 ? 2 : 4
      grid.fill(cx, floor + 1, cz, Block.ashlar)
      for (let k = 0; k < courses; k++) grid.fill(cx, floor + 2 + k, cz, Block.marble)
      if (i !== 1) grid.fill(cx, floor + 2 + courses, cz, Block.ashlar)
    }
    grid.fill(bx(x + 0.31), floor + 1, bz(z + 0.59), Block.marble)
    grid.fill(bx(x + 0.81), floor + 1, bz(z + 0.59), Block.marble)
  }

  // Stacks of quarried blocks waiting beside the path.
  for (const [x, z, height] of [[8.1, 4.4, 3], [9.3, 5.4, 2], [7.9, 6.1, 1]]) {
    const ix = bx(x), iz = bz(z)
    const floor = topOf(grid, ix, iz) + 1
    for (const dx of [0, 1]) {
      footing(grid, ix + dx, iz, floor, Block.planks)
      for (let row = 0; row < height; row++) grid.fill(ix + dx, floor + 1 + row, iz, Block.limestone)
    }
  }
}

function boulders(grid: Grid) {
  const rng = random(6161)
  const keepClear = [spawn, siteMarker, tourMarker]
  for (let i = 0; i < 70; i++) {
    const x = (rng() - 0.5) * 56, z = (rng() - 0.5) * 56
    const radius = Math.hypot(x, z)
    if (radius < KOILON_EDGE + 1.6 || radius > islandEdge(Math.atan2(x, -z)) - 3.5 || onPath(x, z) || inQuarry(x, z)
      || keepClear.some(([px, , pz]) => Math.hypot(px - x, pz - z) < 2.5)) continue
    const ix = bx(x), iz = bz(z)
    const top = topOf(grid, ix, iz)
    grid.fill(ix, top + 1, iz, Block.limestone)
    if (rng() > 0.5) grid.fill(ix + 1, topOf(grid, ix + 1, iz) + 1, iz, Block.limestone)
    if (rng() > 0.7) grid.fill(ix, top + 2, iz, Block.limestone)
  }
}

/** Direction of the road at a point on it, as a unit vector. */
function roadDirection(x: number, z: number): Point2 {
  let best: Point2 = [1, 0], distance = Infinity
  for (const line of ROADS) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1]
      const d = nearest([line[i], line[i + 1]], x, z).distance
      if (d < distance) { distance = d; const l = Math.hypot(bx - ax, bz - az); best = [(bx - ax) / l, (bz - az) / l] }
    }
  }
  return best
}

/** A stone bridge where the road crosses the stream: an ashlar deck level with the road on both banks, with low parapets. */
function bridge(grid: Grid, [x, z]: Point2) {
  const [dx, dz] = roadDirection(x, z)
  const span = 4.5
  // The top block of the ground just beyond each end of the bridge.
  const bank = (side: number) => topOf(grid, bx(x + dx * (span + 0.3) * side), bz(z + dz * (span + 0.3) * side))
  // Level with the higher bank, and always clear of the water so the stream runs under it.
  const water = OY + level(streamBed(x, z).bed)
  const deck = Math.max(bank(-1), bank(1), water + 1)
  // The walkway first, then the parapets on cells the walkway does not use (the road runs at an
  // angle, so the two sample sets share cells).
  const walkway = new Map<string, [number, number, number]>()
  const parapet = new Map<string, [number, number, number]>()
  for (let t = -span; t <= span; t += S / 4) {
    // Each end ramps up from its bank one block at a time, so the road never has a tall step.
    const y = Math.min(deck, bank(t < 0 ? -1 : 1) + Math.floor((span - Math.abs(t)) / S))
    for (let w = -ROAD_WIDTH - 0.3; w <= ROAD_WIDTH + 0.3; w += S / 4) {
      const ix = bx(x + dx * t - dz * w), iz = bz(z + dz * t + dx * w)
      const key = `${ix},${iz}`
      if (Math.abs(w) <= ROAD_WIDTH) walkway.set(key, [ix, Math.max(y, walkway.get(key)?.[1] ?? -1), iz])
      else if (Math.abs(t) <= span - 1.2) parapet.set(key, [ix, y, iz])
    }
  }
  for (const [ix, y, iz] of walkway.values()) {
    for (let k = y + 1; k <= y + 4; k++) grid.fill(ix, k, iz, Block.air)
    grid.fill(ix, y, iz, Block.ashlar)
  }
  for (const [key, [ix, y, iz]] of parapet) {
    if (walkway.has(key)) continue
    grid.fill(ix, y, iz, Block.ashlar)
    grid.fill(ix, y + 1, iz, Block.limestone)
  }
}

/** A boundary stone (horos): a short limestone pillar with a marble cap. */
function horos(grid: Grid, x: number, z: number, height = 2) {
  const ix = bx(x), iz = bz(z)
  const floor = topOf(grid, ix, iz) + 1
  for (let y = 0; y < height; y++) grid.fill(ix, floor + y, iz, Block.limestone)
  grid.fill(ix, floor + height, iz, Block.marble)
}

/** Boundary stones either side of the road where it enters each new area, and a herm where roads meet. */
function markers(grid: Grid) {
  for (const item of AREAS) {
    if (item.id === 'theatre') continue
    const [x, z] = item.entrance
    const [dx, dz] = roadDirection(x, z)
    for (const side of [-1, 1]) horos(grid, x - dz * side * 1.5, z + dx * side * 1.5)
  }
  // A herm: a pillar of ashlar crowned with a carved marble head, at the fork below the theatre.
  const [hx, hz] = [-3.6, 37.4]
  const ix = bx(hx), iz = bz(hz)
  const floor = topOf(grid, ix, iz) + 1
  for (let y = 0; y < 3; y++) grid.fill(ix, floor + y, iz, Block.ashlar)
  grid.fill(ix, floor + 3, iz, Block.marble)
}

/**
 * Prepares the theatre's building site: every blueprint cell starts empty (the orchestra ring
 * becomes a shallow trench) and the lowest courses get solid ground beneath them.
 */
function site(grid: Grid) {
  for (const cell of cells) grid.fill(cell.x, cell.y, cell.z, Block.air)
  for (const cell of cells) if (cell.footing) footing(grid, cell.x, cell.z, cell.y - 1, Block.soil)
}

/** Every open cell at or below sea level is sea. */
function sea(grid: Grid) {
  for (let y = 1; y <= SEA_Y; y++) {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) if (grid.get(x, y, z) === Block.air) grid.fill(x, y, z, Block.water)
    }
  }
}

export function generate(grid: Grid) {
  terrain(grid)
  trees(grid)
  ruins(grid)
  boulders(grid)
  for (const point of bridges()) bridge(grid, point)
  markers(grid)
  site(grid)
  sea(grid)
}
