import { AREAS, ORE_HILL, RIDGE, STADIUM_HILLS, STREAM, STREAM_BED, STREAM_WIDTH, TALL_HILL, areaWeight, farFrom, nearest, oreHill, smoothstep, tallHill, type Point2 } from './regions'
import { KOILON_EDGE, inAisle, rowBase, rowRise, siteMarker, terraceOf, tourMarker } from './theatre'

/** Angle difference wrapped to -π…π. */
const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Small coves: narrow inlets where the sea reaches in, each with a sandy beach at its head. */
export const COVES: readonly { angle: number; depth: number }[] = [
  { angle: -2.25, depth: 9 }, { angle: -1.15, depth: 8 }, { angle: 2.8, depth: 8 }, { angle: 1.3, depth: 7 },
]
const COVE_WIDTH = 0.075
/** Stretches of rocky cliff coast, as angle ranges; elsewhere the shore slopes gently into the sea. */
export const CLIFFS: readonly Point2[] = [[-0.95, 0.45], [0.62, 1.05], [-1.95, -1.45]]
/** Sea caves cut into the cliffs, by angle. */
export const SEA_CAVES: readonly number[] = [-0.55, 0.12, 0.85, -1.7]

/** 1 along a cliff coast, 0 where the shore is gentle. */
export function cliffWeight(angle: number) {
  let weight = 0
  for (const [from, to] of CLIFFS) weight = Math.max(weight, smoothstep(from - 0.08, from + 0.04, angle) * smoothstep(to + 0.08, to - 0.04, angle))
  return weight
}
/** 1 at the head of a cove, where the sand is widest. */
const coveWeight = (angle: number) => Math.max(...COVES.map((cove) => Math.exp(-((turn(angle - cove.angle) / 0.13) ** 2))))

/**
 * The shore of the larger island: an irregular coast with small coves, a wide bay cut into the
 * east from the north-east round to the stadium, and stretches of cliff between gentle beaches.
 */
export function islandEdge(angle: number) {
  const bay = 24 * smoothstep(0.5, 1.1, angle) * smoothstep(2.4, 1.7, angle)
  const wiggle = 3 * Math.sin(angle * 3 + 0.7) + 2 * Math.sin(angle * 5 + 1.1)
    + 2.2 * Math.sin(angle * 7 + 0.3) + 1.4 * Math.sin(angle * 11 + 2.1) + 0.9 * Math.sin(angle * 17 + 0.8)
  let coves = 0
  for (const cove of COVES) coves += cove.depth * Math.exp(-((turn(angle - cove.angle) / COVE_WIDTH) ** 2))
  return 82 + wiggle - bay - coves
}

/** How far the land takes to slope into the sea: short at a cliff, long on a beach. */
const shoreWidth = (angle: number) => 5 * (1 - 0.78 * cliffWeight(angle)) + 3 * coveWeight(angle)
/** True on a gentle, sandy stretch of shore (not a cliff). */
export const sandyShore = (angle: number) => cliffWeight(angle) < 0.5
/** The shore of the first, small island. The theatre valley inside it keeps its exact shape. */
const firstEdge = (angle: number) => 29 + 3.4 * Math.sin(angle * 3 + 0.7) + 1.8 * Math.sin(angle * 5 + 1.1)
/** Within this radius the ground is exactly the first island's; it blends into the new land by KEEP_BLEND. */
const KEEP = 20, KEEP_BLEND = 30

/** The new land beyond the theatre valley: rolling ground, the dividers, the building areas and the stream. */
function land(x: number, z: number, hills: number) {
  let height = hills + 0.9 + 0.55 * Math.sin(x * 0.08 + 1) * Math.cos(z * 0.07)
  // Highlands to the north, where the stream rises.
  height += 3.6 * smoothstep(-28, -58, z)
  // The rocky ore hill north-east of the theatre, and the tall hill north-west of it.
  height += ORE_HILL.height * oreHill(x, z)
  height += TALL_HILL.height * tallHill(x, z)
  // The wooded ridge, lowered to a pass where the road crosses.
  const ridge = nearest(RIDGE.line, x, z)
  const ends = smoothstep(0, 10, ridge.along) * smoothstep(ridge.length, ridge.length - 10, ridge.along)
  const pass = 1 - 0.9 * Math.exp(-((Math.hypot(x - RIDGE.pass[0], z - RIDGE.pass[1]) / RIDGE.passRadius) ** 2))
  height += RIDGE.height * Math.exp(-((ridge.distance / RIDGE.spread) ** 2)) * ends * pass
  // The stadium valley's two hills.
  const stadium = AREAS.find((item) => item.id === 'stadium')!
  const along = smoothstep(STADIUM_HILLS.from, STADIUM_HILLS.from + 6, x) * smoothstep(STADIUM_HILLS.to, STADIUM_HILLS.to - 6, x)
  for (const side of [-1, 1]) {
    const across = z - (stadium.z + side * STADIUM_HILLS.offset)
    height += STADIUM_HILLS.height * along * Math.exp(-((across / STADIUM_HILLS.spread) ** 2))
  }
  // Level ground for each building.
  for (const item of AREAS) {
    if (item.id === 'theatre') continue
    const weight = areaWeight(item, x, z)
    if (weight > 0) height = height * (1 - weight) + item.height * weight
  }
  return height
}

/** A point on a polyline at a distance along it, with the line's direction there. */
function pointAt(line: readonly Point2[], along: number) {
  let left = along
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1]
    const length = Math.hypot(bx - ax, bz - az)
    if (left <= length || i + 2 === line.length) {
      const t = Math.min(1, left / length)
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / length, dz: (bz - az) / length }
    }
    left -= length
  }
  return { x: line[0][0], z: line[0][1], dx: 1, dz: 0 }
}

/** Sampling step of the stream bed profile, in world units. */
const BED_STEP = 0.5
let bedProfile: Float64Array | null = null

/**
 * The stream bed, worked out once along the whole stream: always at least one unit (two blocks)
 * below the lowest ground at its middle and on both banks, and never rising on the way to the sea.
 * So the water always lies one level below the ground beside it, on the hills as by the sea.
 */
function profile() {
  if (bedProfile) return bedProfile
  const { length } = nearest(STREAM, STREAM[0][0], STREAM[0][1])
  const bed = new Float64Array(Math.ceil(length / BED_STEP) + 1)
  // Sample the ground across the whole cut, so a bank on a side slope still stands above the water.
  const sides = [STREAM_WIDTH.water + 0.6, STREAM_WIDTH.cut, 3]
  for (let i = 0; i < bed.length; i++) {
    const { x, z, dx, dz } = pointAt(STREAM, i * BED_STEP)
    let lowest = baseGround(x, z)
    for (const side of sides) lowest = Math.min(lowest, baseGround(x - dz * side, z + dx * side), baseGround(x + dz * side, z - dx * side))
    bed[i] = Math.max(STREAM_BED.mouth - 0.7, Math.min(i ? bed[i - 1] : Infinity, lowest - 1))
  }
  bedProfile = bed
  return bed
}

const bedAt = (along: number) => {
  const bed = profile()
  const i = Math.min(bed.length - 1, Math.max(0, along / BED_STEP))
  const low = Math.floor(i), high = Math.min(bed.length - 1, low + 1)
  return bed[low] + (bed[high] - bed[low]) * (i - low)
}

/** The stream cuts its own bed, with banks that rise from the water's edge. */
function carveStream(x: number, z: number, height: number) {
  if (farFrom(STREAM, x, z, STREAM_WIDTH.cut * 2)) return height
  const stream = nearest(STREAM, x, z)
  if (stream.distance >= STREAM_WIDTH.cut * 2) return height
  const bed = bedAt(stream.along)
  if (stream.distance < STREAM_WIDTH.water) return Math.min(height, bed)
  return Math.min(height, bed + 1 + (stream.distance - STREAM_WIDTH.water) * 0.9)
}

/** Height of the stream bed nearest a point, and how far the point is from the stream's middle. */
export function streamBed(x: number, z: number) {
  const stream = nearest(STREAM, x, z)
  return { distance: stream.distance, bed: bedAt(stream.along) }
}

export function ground(x: number, z: number): number {
  const height = baseGround(x, z)
  return Math.hypot(x, z) > KEEP ? carveStream(x, z, height) : height
}

/** The ground before the stream cuts its bed into it. */
function baseGround(x: number, z: number): number {
  const radius = Math.hypot(x, z)
  const angle = Math.atan2(x, -z)
  const hills = 5.7 * Math.exp(-((x + 10) ** 2 / 155 + (z + 17) ** 2 / 65))
    + 3.8 * Math.exp(-((x - 14) ** 2 / 54 + (z + 7) ** 2 / 240))
    + 2.5 * Math.exp(-((x + 19) ** 2 / 80 + (z - 5) ** 2 / 200))
  // The slope the koilon is cut into, high enough behind the top row to hold all five terraces.
  const ridge = Math.max(hills, 2.45 * Math.exp(-(x ** 2 / 420 + (z + 11) ** 2 / 110)))
  const wild = ridge + 0.38 * Math.sin(x * 0.39) * Math.cos(z * 0.32)
  const first = Math.min(1, Math.max(0, (firstEdge(angle) - radius) / 5))
  let outside = wild
  if (first < 1 || radius > KEEP) {
    // Where the first island used to slope into the sea, it now slopes into the new land instead.
    const shore = Math.min(1, Math.max(0, (islandEdge(angle) - radius) / shoreWidth(angle)))
    const beyond = land(x, z, wild) * shore - (1 - shore) * 1.4
    const blend = smoothstep(KEEP, KEEP_BLEND, radius)
    outside = (wild * first + beyond * (1 - first)) * (1 - blend) + beyond * blend
  }
  if (radius < 4.18) return 0.03
  const tier = rowBase + terraceOf(radius) * rowRise - 0.02 - (inAisle(angle) ? 0.31 : 0)
  const approach = Math.max(0, Math.min(1, (Math.abs(angle) - 1.18) / 0.28))
  const shelf = (1 - approach) * tier + approach * 0.05
  const merge = Math.max(0, Math.min(1, (radius - KOILON_EDGE - 0.13) / 4))
  return shelf * (1 - merge) + outside * merge
}

export type Obstacle = { x: number; z: number; radius: number }
export const obstacles: Obstacle[] = [
  { x: siteMarker[0], z: siteMarker[2], radius: 0.4 },
  { x: tourMarker[0], z: tourMarker[2], radius: 0.35 },
  { x: 8.1, z: 4.4, radius: 0.76 },
  { x: 9.3, z: 5.4, radius: 0.6 },
  { x: -10.2, z: 5.2, radius: 1.65 },
  { x: 12.9, z: -6.6, radius: 1.7 },
  { x: -9.4, z: -8.5, radius: 0.7 },
  { x: 12.4, z: -4.4, radius: 0.55 },
  { x: 8.6, z: 10.4, radius: 0.55 },
]

export function canWalk(x: number, z: number, blockers: Obstacle[]) {
  const angle = Math.atan2(x, -z)
  return Math.hypot(x, z) < islandEdge(angle) - 3.2
    && !blockers.some((item) => Math.hypot(item.x - x, item.z - z) < item.radius + 0.23)
}
