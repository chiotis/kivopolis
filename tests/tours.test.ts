import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { agoraCells } from '../src/game/blueprints/agora'
import { sanctuaryCells } from '../src/game/blueprints/sanctuary'
import { Block, isOpaque } from '../src/voxel/blocks'
import { VoxelWorld, bx, by, bz } from '../src/voxel/world'
import { tourLength, tourShot, type BuildingTour } from '../src/world/tours'

/** The island with both buildings standing, as it is when their tours run. */
const world = new VoxelWorld()
for (const cell of [...sanctuaryCells, ...agoraCells]) if (cell.block !== Block.water) world.set(cell.x, cell.y, cell.z, cell.block)

const blockAt = (point: Vector3) => world.get(bx(point.x), by(point.y), bz(point.z))
/** Anything the camera could sit inside: a solid block, or water. */
const filled = (point: Vector3) => blockAt(point) !== Block.air

const key = (x: number, y: number, z: number) => `${x},${y},${z}`
const cellsOf: Record<BuildingTour, Set<string>> = {
  sanctuary: new Set(sanctuaryCells.map(({ x, y, z }) => key(x, y, z))),
  agora: new Set(agoraCells.map(({ x, y, z }) => key(x, y, z))),
}

/** True when the line from the eye to where it looks first meets a hill, a tree or anything but the building. */
function hidden(id: BuildingTour, eye: Vector3, look: Vector3) {
  const steps = Math.ceil(eye.distanceTo(look) / 0.05)
  const point = new Vector3()
  for (let i = 0; i <= steps; i++) {
    point.lerpVectors(eye, look, i / steps)
    if (isOpaque(blockAt(point))) return !cellsOf[id].has(key(bx(point.x), by(point.y), bz(point.z)))
  }
  return false
}

function flight(id: BuildingTour) {
  const shots: { eye: Vector3; look: Vector3 }[] = []
  const length = tourLength(id, false) - 1.5
  for (let i = 0; i <= 140; i++) {
    const eye = new Vector3(), look = new Vector3()
    tourShot(id, (length * i) / 140, false, eye, look)
    shots.push({ eye, look })
  }
  return shots
}

describe.each<BuildingTour>(['sanctuary', 'agora'])('the %s tour', (id) => {
  const shots = flight(id)

  it('flies through open air the whole way, never inside a block, the ground or water', () => {
    for (const { eye } of shots) {
      // A small box round the eye, so the near plane never cuts into a wall either.
      for (const [dx, dy, dz] of [[0, 0, 0], [0.2, 0, 0], [-0.2, 0, 0], [0, 0.2, 0], [0, -0.2, 0], [0, 0, 0.2], [0, 0, -0.2]]) {
        expect(filled(new Vector3(eye.x + dx, eye.y + dy, eye.z + dz)), `${id} eye at ${eye.toArray().map((v) => v.toFixed(2))}`).toBe(false)
      }
    }
  })

  it('keeps the building in sight', () => {
    const clear = shots.filter(({ eye, look }) => !hidden(id, eye, look)).length
    expect(clear / shots.length).toBeGreaterThan(0.9)
  })

  it('glides no faster than a brisk flight, without jumps', () => {
    const step = (tourLength(id, false) - 1.5) / 140
    // Units a second; the theatre's tour circles at about 3, a brisk walk is 2, and the flights keep further out.
    for (let i = 1; i < shots.length; i++) expect(shots[i].eye.distanceTo(shots[i - 1].eye) / step).toBeLessThan(6)
  })

  it('starts and lands at rest, and shows a still view with reduced motion', () => {
    const eye = new Vector3(), look = new Vector3(), later = new Vector3()
    tourShot(id, 0, false, eye, look)
    tourShot(id, 0.05, false, later, look)
    expect(eye.distanceTo(later)).toBeLessThan(0.01)
    tourShot(id, 0, true, eye, look)
    tourShot(id, 3, true, later, look)
    expect(eye.equals(later)).toBe(true)
    expect(filled(eye)).toBe(false)
    expect(hidden(id, eye, look)).toBe(false)
    expect(tourLength(id, true)).toBeLessThan(tourLength(id, false))
  })
})
