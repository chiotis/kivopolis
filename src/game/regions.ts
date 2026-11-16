/**
 * The layout of the larger island (Phase 11): one area per building, the land that separates them,
 * the stream and the ancient road that joins them. Plain data and functions in world units, so the
 * terrain, the generator, tests and later a room server all read the same map.
 *
 * North is uphill (-Z), as in the theatre. The theatre sits at the origin.
 */

export type Point2 = readonly [number, number]
export type BuildingId = 'theatre' | 'sanctuary' | 'agora' | 'stadium'

export interface Area {
  id: BuildingId
  /** Centre and half-sizes of the level ground the building stands on. */
  x: number
  z: number
  rx: number
  rz: number
  /** Ground height of the level area (the theatre keeps its own shaped bowl). */
  height: number
  /** Where the road enters the area: its boundary stones stand either side of it here. */
  entrance: Point2
  /** The area's signpost, just off the road by the entrance. */
  sign: Point2
}

export const AREAS: readonly Area[] = [
  { id: 'theatre', x: 0, z: 0, rx: 14, rz: 14, height: 0, entrance: [6.4, 5.8], sign: [6.4, 5.8] },
  // A level terrace just below the theatre, across the stream, as theatres stood in Dionysus' sanctuary.
  { id: 'sanctuary', x: -31, z: 20, rx: 8.5, rz: 7.5, height: 0.6, entrance: [-23.4, 15.6], sign: [-21.2, 16] },
  // The open square on the western plain, beyond the wooded ridge.
  { id: 'agora', x: -60, z: 4, rx: 10.5, rz: 10.5, height: 0.5, entrance: [-51.2, 8.6], sign: [-49, 8.3] },
  // A long, level valley floor between two low hills; the track runs along x.
  { id: 'stadium', x: 24, z: 40, rx: 25, rz: 6.5, height: 0.4, entrance: [-1.6, 39.6], sign: [0.6, 37.4] },
]
export const area = (id: BuildingId) => AREAS.find((item) => item.id === id)!

/**
 * The stream, from its spring in the northern hills: it bends west, comes back past the theatre's
 * west side road (the first bridge), runs by the sanctuary and swings south-west to the sea.
 */
export const STREAM: readonly Point2[] = [
  [-14, -62], [-20, -44], [-29, -26], [-30, -12], [-24, 0], [-19.5, 10], [-18, 20], [-22, 30], [-30, 40], [-36, 54], [-38, 72], [-40, 96],
]
/** Ground height of the stream bed at its spring and where it meets the sea. */
export const STREAM_BED = { spring: 3.2, mouth: -0.9 }
/** Half-width of the water and of the cut the stream runs in. */
export const STREAM_WIDTH = { water: 0.9, cut: 2.2 }

/** The ancient road, as connected stretches. */
export const ROADS: readonly (readonly Point2[])[] = [
  // From the theatre's west side road, over the first bridge, into the sanctuary.
  [[-12.6, 3.4], [-16.5, 8], [-23.4, 15.6]],
  // Out of the sanctuary to the west, through the pass in the ridge, to the agora.
  [[-39.5, 20], [-46, 15], [-51.2, 8.6]],
  // From the agora south and east, over the second bridge, to the stadium.
  [[-58, 14.5], [-46, 34], [-24, 44.5], [-9, 43.6], [-1.6, 39.6]],
  // From the landing path below the theatre down to the stadium road.
  [[6.4, 22.5], [1.5, 30], [-1.6, 39.6]],
]
/** Half-width of the paved road. */
export const ROAD_WIDTH = 0.75

/** The wooded ridge between the theatre and the agora, with a pass where the road crosses it. */
export const RIDGE = { line: [[-46, -60], [-46, 30]] as readonly Point2[], height: 5.2, spread: 4.2, pass: [-46, 15] as Point2, passRadius: 8 }

/**
 * A rocky hill north-east of the theatre: bare limestone and gravel on its slopes, with more
 * copper and tin ore than anywhere else, both on the surface and just under it.
 */
export const ORE_HILL = { x: 24, z: -42, rx: 12, rz: 9, height: 6.5 }
/** 0 away from the ore hill, rising to 1 at its crown. */
export const oreHill = (x: number, z: number) =>
  Math.exp(-(((x - ORE_HILL.x) / ORE_HILL.rx) ** 2 + ((z - ORE_HILL.z) / ORE_HILL.rz) ** 2) * 1.6)

/** Two low hills along the stadium valley, whose inner slopes hold the spectators. */
export const STADIUM_HILLS = { offset: 12, height: 3.2, spread: 4.5, from: 2, to: 48 }

export interface Nearest { distance: number; /** Distance along the line to the nearest point. */ along: number; length: number }

interface Prepared { ax: Float64Array; az: Float64Array; dx: Float64Array; dz: Float64Array; len2: Float64Array; start: Float64Array; length: number; box: [number, number, number, number] }
const prepared = new WeakMap<readonly Point2[], Prepared>()

/** Segment data of a polyline, worked out once: the terrain asks for it for every column. */
function prepare(line: readonly Point2[]): Prepared {
  let result = prepared.get(line)
  if (result) return result
  const n = line.length - 1
  const ax = new Float64Array(n), az = new Float64Array(n), dx = new Float64Array(n), dz = new Float64Array(n)
  const len2 = new Float64Array(n), start = new Float64Array(n)
  let walked = 0
  for (let i = 0; i < n; i++) {
    ax[i] = line[i][0]; az[i] = line[i][1]
    dx[i] = line[i + 1][0] - ax[i]; dz[i] = line[i + 1][1] - az[i]
    len2[i] = dx[i] * dx[i] + dz[i] * dz[i]
    start[i] = walked
    walked += Math.sqrt(len2[i])
  }
  const xs = line.map(([x]) => x), zs = line.map(([, z]) => z)
  result = { ax, az, dx, dz, len2, start, length: walked, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] }
  prepared.set(line, result)
  return result
}

/** Distance from a point to a polyline, and how far along it the nearest point lies. */
export function nearest(line: readonly Point2[], x: number, z: number): Nearest {
  const { ax, az, dx, dz, len2, start, length } = prepare(line)
  let best = Infinity, along = 0
  for (let i = 0; i < ax.length; i++) {
    const t = Math.max(0, Math.min(1, ((x - ax[i]) * dx[i] + (z - az[i]) * dz[i]) / len2[i]))
    const ex = x - (ax[i] + dx[i] * t), ez = z - (az[i] + dz[i] * t)
    const d2 = ex * ex + ez * ez
    if (d2 < best) { best = d2; along = start[i] + t * Math.sqrt(len2[i]) }
  }
  return { distance: Math.sqrt(best), along, length }
}

/** True when a point is certainly further than `range` from every point of the polyline. */
export function farFrom(line: readonly Point2[], x: number, z: number, range: number) {
  const [x0, x1, z0, z1] = prepare(line).box
  return x < x0 - range || x > x1 + range || z < z0 - range || z > z1 + range
}

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** 0 outside an area, 1 on its level ground, easing in over its rim. */
export function areaWeight(item: Area, x: number, z: number) {
  const d = Math.hypot((x - item.x) / item.rx, (z - item.z) / item.rz)
  return 1 - smoothstep(0.8, 1.25, d)
}

/** The building area a point is in, if any. */
export function areaAt(x: number, z: number) {
  return AREAS.find((item) => Math.hypot((x - item.x) / item.rx, (z - item.z) / item.rz) < 1) ?? null
}

/** Distance to the nearest stretch of road; roads further than 8 units may report Infinity. */
export function roadDistance(x: number, z: number) {
  let best = Infinity
  for (const line of ROADS) if (!farFrom(line, x, z, Math.min(best, 8))) best = Math.min(best, nearest(line, x, z).distance)
  return best
}
export const onRoad = (x: number, z: number) => ROADS.some((line) => !farFrom(line, x, z, ROAD_WIDTH) && nearest(line, x, z).distance < ROAD_WIDTH)

/** Where the road crosses the stream: a stone bridge stands at each. */
export function bridges(): Point2[] {
  const result: Point2[] = []
  for (const line of ROADS) {
    for (let i = 0; i + 1 < line.length; i++) {
      for (let j = 0; j + 1 < STREAM.length; j++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1], [cx, cz] = STREAM[j], [dx, dz] = STREAM[j + 1]
        const denominator = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx)
        if (!denominator) continue
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / denominator
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / denominator
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) result.push([ax + (bx - ax) * t, az + (bz - az) * t])
      }
    }
  }
  return result
}
