import { AREAS, RIDGE, STADIUM_HILLS, STREAM, STREAM_BED, STREAM_WIDTH, areaWeight, nearest, smoothstep } from './regions'
import { KOILON_EDGE, inAisle, rowBase, rowRise, siteMarker, terraceOf, tourMarker } from './theatre'

/** The shore of the larger island (Phase 11). */
export function islandEdge(angle: number) {
  return 82 + 3 * Math.sin(angle * 3 + 0.7) + 2 * Math.sin(angle * 5 + 1.1)
}
/** The shore of the first, small island. The theatre valley inside it keeps its exact shape. */
const firstEdge = (angle: number) => 29 + 3.4 * Math.sin(angle * 3 + 0.7) + 1.8 * Math.sin(angle * 5 + 1.1)
/** Within this radius the ground is exactly the first island's; it blends into the new land by KEEP_BLEND. */
const KEEP = 20, KEEP_BLEND = 30

/** The new land beyond the theatre valley: rolling ground, the dividers, the building areas and the stream. */
function land(x: number, z: number, hills: number) {
  let height = hills + 0.9 + 0.55 * Math.sin(x * 0.08 + 1) * Math.cos(z * 0.07)
  // Highlands to the north, where the stream rises.
  height += 3.6 * smoothstep(-28, -58, z)
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

/** The stream cuts its own bed, falling steadily from the spring to the sea. */
function carveStream(x: number, z: number, height: number) {
  const stream = nearest(STREAM, x, z)
  if (stream.distance >= STREAM_WIDTH.cut * 2) return height
  const bed = STREAM_BED.spring + (STREAM_BED.mouth - STREAM_BED.spring) * stream.along / stream.length
  return Math.min(height, bed + Math.max(0, stream.distance - STREAM_WIDTH.water) * 0.9)
}

/** Height of the stream bed nearest a point, and how far the point is from the stream's middle. */
export function streamBed(x: number, z: number) {
  const stream = nearest(STREAM, x, z)
  return { distance: stream.distance, bed: STREAM_BED.spring + (STREAM_BED.mouth - STREAM_BED.spring) * stream.along / stream.length }
}

export function ground(x: number, z: number): number {
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
    const shore = Math.min(1, Math.max(0, (islandEdge(angle) - radius) / 5))
    const beyond = land(x, z, wild) * shore - (1 - shore) * 1.4
    const blend = smoothstep(KEEP, KEEP_BLEND, radius)
    outside = (wild * first + beyond * (1 - first)) * (1 - blend) + beyond * blend
  }
  if (radius > KEEP) outside = carveStream(x, z, outside)
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
