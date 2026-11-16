import { describe, expect, it } from 'vitest'
import { AREAS, ORE_HILL, ROADS, STREAM, STREAM_WIDTH, TALL_HILL, areaAt, bridges, nearest, onRoad } from '../src/game/regions'
import { CLIFFS, SEA_CAVES, ground, islandEdge } from '../src/game/terrain'
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

  it('reaches out to a shore around 82 units from the theatre, with a bay cut into the east', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const edge = islandEdge(a)
      expect(edge).toBeGreaterThan(48)
      expect(edge).toBeLessThan(90)
      expect(ground(Math.sin(a) * (edge + 3), -Math.cos(a) * (edge + 3))).toBeLessThan(-0.2)
    }
    // The bay: the east coast is much closer than the west.
    expect(islandEdge(Math.PI / 2)).toBeLessThan(62)
    expect(islandEdge(-Math.PI / 2)).toBeGreaterThan(78)
    // The stadium valley stays on dry land, east end included.
    expect(ground(49, 40)).toBeGreaterThan(0)
  })

  it('puts a rocky hill full of ore north-east of the theatre', () => {
    const count = (cx: number, cz: number) => {
      let ores = 0
      for (let x = cx - 8; x <= cx + 8; x += 0.5) {
        for (let z = cz - 6; z <= cz + 6; z += 0.5) {
          for (let y = 1; y < 46; y++) {
            const id = world.get(bx(x), y, bz(z))
            if (id === Block.copperOre || id === Block.tinOre) ores++
          }
        }
      }
      return ores
    }
    expect(ground(ORE_HILL.x, ORE_HILL.z)).toBeGreaterThan(8)
    // Far more copper and tin than in the same patch of the western plain.
    expect(count(ORE_HILL.x, ORE_HILL.z)).toBeGreaterThan(count(-60, -20) * 2)
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

  it('keeps the stream one level below the ground on both banks, from the hills to the sea', () => {
    let checked = 0
    for (let i = 0; i + 1 < STREAM.length; i++) {
      const [ax, az] = STREAM[i], [bx2, bz2] = STREAM[i + 1]
      const length = Math.hypot(bx2 - ax, bz2 - az), dx = (bx2 - ax) / length, dz = (bz2 - az) / length
      for (let t = 0.25; t < length - 0.25; t += 0.75) {
        const x = ax + dx * t, z = az + dz * t
        const r = Math.hypot(x, z)
        if (r < 22 || r > islandEdge(Math.atan2(x, -z)) - 6) continue
        if (bridges().some(([px, pz]) => Math.hypot(px - x, pz - z) < 5)) continue
        let water = -1
        for (let y = 45; y > 0; y--) if (isWater(world.get(bx(x), y, bz(z)))) { water = y; break }
        expect(water, `no water at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeGreaterThan(0)
        for (const side of [-1, 1]) {
          const sx = x - dz * side * (STREAM_WIDTH.water + 0.9), sz = z + dx * side * (STREAM_WIDTH.water + 0.9)
          expect(top(sx, sz), `bank at ${sx.toFixed(1)}, ${sz.toFixed(1)}`).toBeGreaterThanOrEqual(water + 1)
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('has an irregular coast with sandy beaches, rocky cliffs and sea caves', () => {
    let sand = 0, rock = 0
    for (let a = -Math.PI; a < Math.PI; a += 0.02) {
      const r = islandEdge(a) - 1.5, x = Math.sin(a) * r, z = -Math.cos(a) * r
      const id = world.get(bx(x), top(x, z), bz(z))
      if (id === Block.sand || id === Block.clay) sand++
      if (id === Block.limestone || id === Block.gravel) rock++
    }
    expect(sand).toBeGreaterThan(80)
    expect(rock).toBeGreaterThan(20)
    expect(CLIFFS.length).toBeGreaterThan(1)
    // Each sea cave has open space (air or sea water) a few units inside the cliff, under a rock roof.
    for (const angle of SEA_CAVES) {
      let roofed = 0
      for (let depth = 3; depth <= 10; depth += 0.5) {
        const r = islandEdge(angle) + 1 - depth, x = Math.sin(angle) * r, z = -Math.cos(angle) * r
        const surface = top(x, z)
        for (let y = 12; y < surface - 1; y++) {
          const id = world.get(bx(x), y, bz(z))
          if ((id === Block.air || isWater(id)) && world.solidAt(bx(x), surface, bz(z))) roofed++
        }
      }
      expect(roofed, `cave at ${angle}`).toBeGreaterThan(5)
    }
  })

  it('raises the tallest hill north-west of the theatre, above the ore hill', () => {
    expect(ground(TALL_HILL.x, TALL_HILL.z)).toBeGreaterThan(ground(ORE_HILL.x, ORE_HILL.z) + 1)
    expect(ground(TALL_HILL.x, TALL_HILL.z)).toBeGreaterThan(10)
  })
})
