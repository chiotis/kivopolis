import { CatmullRomCurve3, MathUtils, Vector3 } from 'three'
import { ALTAR, FLOOR as SANCTUARY_FLOOR, KREPIS } from '../game/blueprints/sanctuary'
import { FLOOR as AGORA_FLOOR, KRENE, SQUARE, STOA } from '../game/blueprints/agora'
import { wx, wy, wz } from '../voxel/grid'

/**
 * The finishing flights of the sanctuary and the agora: like the theatre's tour round its hollow,
 * the camera glides along a few points that show how the building's parts fit together, then the
 * building's signpost window opens. Kept free of React so that tests can check every point.
 */
export type BuildingTour = 'sanctuary' | 'agora'

interface Flight {
  /** Seconds of flight; the window opens a moment after it lands. */
  length: number
  /** Where the camera stands (world units), from the first point to the last. */
  eye: CatmullRomCurve3
  /** Where it looks, point by point with the eye. */
  look: CatmullRomCurve3
  /** The single view shown instead when motion is reduced. */
  still: { eye: Vector3; look: Vector3 }
}

const curve = (points: readonly (readonly [number, number, number])[]) =>
  new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal')

/** World centre of a block range [from, to], both ends included. */
const mid = (from: number, to: number, toWorld: (block: number) => number) => (toWorld(from) + toWorld(to + 1)) / 2

/**
 * The sanctuary faces east. The flight starts low beyond the altar, where the procession arrived,
 * looking at the east front, then climbs round the colonnade to look down over the roof and the
 * pediments from the west, and ends high over the whole precinct.
 */
function sanctuaryFlight(): Flight {
  const x = mid(KREPIS.x0, KREPIS.x1, wx), z = mid(KREPIS.z0, KREPIS.z1, wz), ground = wy(SANCTUARY_FLOOR)
  const altar = mid(ALTAR.x0, ALTAR.x1, wx)
  return {
    length: 24,
    eye: curve([
      [altar + 9, ground + 2.5, z + 1],
      [altar + 8, ground + 6, z - 9],
      [x + 3, ground + 10, z - 16],
      [x - 10, ground + 13, z - 13],
      [x - 16, ground + 15, z + 1],
      [x - 10, ground + 17, z + 14],
    ]),
    look: curve([
      [x + 4, ground + 4, z],
      [x + 3, ground + 4.5, z],
      [x, ground + 4.5, z],
      [x, ground + 4, z],
      [x + 1, ground + 3, z],
      [x + 2, ground + 2, z],
    ]),
    still: { eye: new Vector3(altar + 10, ground + 12, z - 14), look: new Vector3(x, ground + 3, z) },
  }
}

/**
 * The stoa faces south over the square. The flight starts beyond the square's south edge, looking
 * north at the colonnade over the stalls, rises over the square, turns east to look into the open
 * front of the fountain house, then climbs to look back over the whole agora.
 */
function agoraFlight(): Flight {
  const x = mid(STOA.x0, STOA.x1, wx), front = wz(STOA.z1 + 1), ground = wy(AGORA_FLOOR)
  const south = wz(SQUARE.z1 + 1)
  const krene = { x: mid(KRENE.x0, KRENE.x1, wx), z: mid(KRENE.z0, KRENE.z1, wz) }
  return {
    length: 20,
    eye: curve([
      [x - 3, ground + 2.5, south + 7],
      [x - 1, ground + 5, south + 3],
      [x + 2, ground + 7, south],
      [krene.x - 7, ground + 5, krene.z + 3],
      [krene.x - 3, ground + 9, south + 8],
      [x + 6, ground + 15, south + 12],
    ]),
    look: curve([
      [x, ground + 3, front - 2],
      [x, ground + 3, front - 3],
      [x, ground + 3, front - 3],
      [krene.x + 1, ground + 2, krene.z],
      [krene.x - 2, ground + 1.5, krene.z - 3],
      [x, ground + 2, front],
    ]),
    still: { eye: new Vector3(x + 12, ground + 13, south + 12), look: new Vector3(x, ground + 2, front) },
  }
}

const flights: Record<BuildingTour, Flight> = { sanctuary: sanctuaryFlight(), agora: agoraFlight() }

/** How long a tour runs before its window opens, in seconds. */
export const tourLength = (id: BuildingTour, reducedMotion: boolean) => reducedMotion ? 4 : flights[id].length + 1.5

/** Sets the camera's eye and the point it looks at, `time` seconds into the tour. */
export function tourShot(id: BuildingTour, time: number, reducedMotion: boolean, eye: Vector3, look: Vector3) {
  const flight = flights[id]
  if (reducedMotion) {
    eye.copy(flight.still.eye)
    look.copy(flight.still.look)
    return
  }
  // Ease in and out, so the flight starts and lands gently.
  const t = MathUtils.smoothstep(time, 0, flight.length)
  flight.eye.getPoint(t, eye)
  flight.look.getPoint(t, look)
}

export const isBuildingTour = (id: string): id is BuildingTour => id === 'sanctuary' || id === 'agora'
