import { describe, expect, it } from 'vitest'
import { AREAS, ROADS, STREAM, areaAt, bridges, nearest, onRoad } from '../src/game/regions'
import { ground, islandEdge } from '../src/game/terrain'
import { Block, isWater } from '../src/voxel/blocks'
import { S, VoxelWorld, bx, bz, wy } from '../src/voxel/world'

/** The ground formula of the first, small island, kept here to prove the theatre valley did not move. */
function firstGround(x: number, z: number) {
  const radius = Math.hypot(x, z)
  const angle = Math.atan2(x, -z)
  const hills = 5.7 * Math.exp(-((x + 10) ** 2 / 155 + (z + 17) ** 2 / 65))
    + 3.8 * Math.exp(-((x - 14) ** 2 / 54 + (z + 7) ** 2 / 240))
    + 2.5 * Math.exp(-((x + 19) ** 2 / 80 + (z - 5) ** 2 / 200))
  const ridge = Math.max(hills, 2.45 * Math.exp(-(x ** 2 / 420 + (z + 11) ** 2 / 110)))
  const wild = ridge + 0.38 * Math.sin(x * 0.39) * Math.cos(z * 0.32)
  const edge = 29 + 3.4 * Math.sin(angle * 3 + 0.7) + 1.8 * Math.sin(angle * 5 + 1.1)
  const shore = Math.min(1, Math.max(0, (edge - radius) / 5))
  return wild * shore - (1 - shore) * 1.4
}

const world = new VoxelWorld()
/** Top solid block of a column, as a block index. */
const top = (x: number, z: number) => Math.round((world.surface(x, z)) / S) + 15

describe('the larger island', () => {
  it('keeps the theatre valley exactly as it was', () => {
    for (let x = -18; x <= 18; x += 0.7) {
      for (let z = -18; z <= 18; z += 0.7) {
        const r = Math.hypot(x, z)
        // Inside the bowl the theatre shapes its own ground; outside it the hills must be unchanged.
        if (r < 16 || r > 18.5) continue
        expect(ground(x, z)).toBeCloseTo(firstGround(x, z), 6)
      }
    }
  })

  it('reaches out to a shore around 82 units from the theatre', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const edge = islandEdge(a)
      expect(edge).toBeGreaterThan(76)
      expect(edge).toBeLessThan(88)
      expect(ground(Math.sin(a) * (edge + 3), -Math.cos(a) * (edge + 3))).toBeLessThan(-0.2)
    }
  })

  it('gives every new building a level, dry area of its own', () => {
    for (const item of AREAS.filter(({ id }) => id !== 'theatre')) {
      const heights: number[] = []
      for (let u = -0.7; u <= 0.7; u += 0.1) {
        for (let v = -0.7; v <= 0.7; v += 0.1) {
          if (Math.hypot(u, v) > 0.7) continue
          const x = item.x + u * item.rx, z = item.z + v * item.rz
          heights.push(ground(x, z))
          expect(areaAt(x, z)?.id).toBe(item.id)
          // No trees or water on the building ground.
          const surface = world.get(bx(x), top(x, z) + 1, bz(z))
          expect(surface === Block.air || onRoad(x, z), `${item.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true)
        }
      }
      expect(Math.min(...heights)).toBeGreaterThan(0)
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.3)
    }
  })

  it('carries the road over the stream on two stone bridges', () => {
    const crossings = bridges()
    expect(crossings).toHaveLength(2)
    for (const [x, z] of crossings) {
      const ix = bx(x), iz = bz(z)
      let deck = -1
      for (let y = 40; y > 0; y--) if (world.get(ix, y, iz) === Block.ashlar) { deck = y; break }
      expect(deck).toBeGreaterThan(0)
      expect(world.get(ix, deck + 1, iz)).toBe(Block.air)
      // Open water or air under the deck: the stream still runs through.
      let under = false
      for (let y = deck - 1; y > deck - 6; y--) if (isWater(world.get(ix, y, iz))) under = true
      expect(under).toBe(true)
    }
  })

  it('has a walkable road to every area, with no step taller than one block', () => {
    for (const line of ROADS) {
      const { length } = nearest(line, line[0][0], line[0][1])
      let previous: number | null = null
      for (let walked = 0; walked <= length; walked += 0.25) {
        // Walk along the line by distance.
        let left = walked, x = line[0][0], z = line[0][1]
        for (let i = 0; i + 1 < line.length; i++) {
          const [ax, az] = line[i], [bx2, bz2] = line[i + 1]
          const segment = Math.hypot(bx2 - ax, bz2 - az)
          if (left <= segment) { x = ax + (bx2 - ax) * left / segment; z = az + (bz2 - az) * left / segment; break }
          left -= segment
        }
        const height = top(x, z)
        expect(isWater(world.get(bx(x), height + 1, bz(z))), `water on the road at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(false)
        if (previous !== null) expect(Math.abs(height - previous), `step at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeLessThanOrEqual(1)
        previous = height
      }
    }
    // Each area's entrance lies on the road.
    for (const item of AREAS.filter(({ id }) => id !== 'theatre')) expect(onRoad(...item.entrance)).toBe(true)
  })

  it('fills the stream with water from the hills to the sea', () => {
    let wet = 0, samples = 0
    const { length } = nearest(STREAM, STREAM[0][0], STREAM[0][1])
    for (let t = 2; t < length - 4; t += 1) {
      let left = t, x = STREAM[0][0], z = STREAM[0][1]
      for (let i = 0; i + 1 < STREAM.length; i++) {
        const [ax, az] = STREAM[i], [bx2, bz2] = STREAM[i + 1]
        const segment = Math.hypot(bx2 - ax, bz2 - az)
        if (left <= segment) { x = ax + (bx2 - ax) * left / segment; z = az + (bz2 - az) * left / segment; break }
        left -= segment
      }
      if (Math.hypot(x, z) < 21) continue
      samples++
      for (let y = 40; y > 0; y--) if (isWater(world.get(bx(x), y, bz(z)))) { wet++; break }
    }
    expect(wet / samples).toBeGreaterThan(0.9)
    expect(wy(0)).toBeLessThan(0)
  })
})
