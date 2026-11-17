import { describe, expect, it } from 'vitest'
import { BASIN, COLUMNS, COLUMN_HEIGHT, ENTABLATURE, FLOOR, GROUND, HOROI, KRENE, KRENE_TOP, ROOF, SHOPS, SPOUT, SPRING, SQUARE, STALLS, STOA, STOA_FLOOR, agoraCells, pipeCells, roofHeight, routeColumns, ROUTE_GROUND, springCells } from '../src/game/blueprints/agora'
import { isSpring, spoutOutput } from '../src/voxel/plumbing'
import { blockTop } from '../src/game/terrain'
import { sanctuaryCells } from '../src/game/blueprints/sanctuary'
import { cells as theatreCells } from '../src/game/blueprints/theatre'
import { activeStep, finishedSteps, measurePlan, planOf, plans, stepReady } from '../src/game/plans'
import { agoraSteps, stepText } from '../src/game/el'
import { ROADS, ROAD_WIDTH, areaAt, area, nearest, onRoad } from '../src/game/regions'
import { Block, isSolid, isWater } from '../src/voxel/blocks'
import { VoxelWorld, S, wx, wz } from '../src/voxel/world'

const plan = planOf('agora')!
const world = new VoxelWorld()
const centre = (x: number, z: number) => [wx(x) + S / 2, wz(z) + S / 2] as const
const key = ({ x, y, z }: { x: number; y: number; z: number }) => `${x},${y},${z}`

describe('the agora plan', () => {
  it('has eight steps, all with cells, and Greek texts for each', () => {
    expect(plan.steps.map(({ id }) => id)).toEqual(['horoi', 'stoa', 'colonnade', 'shops', 'stoa-roof', 'krene', 'pipe', 'stalls'])
    expect(plan.steps.every(({ id }) => stepReady(plan, id))).toBe(true)
    for (const { id } of plan.steps) {
      expect(agoraSteps[id]?.note.length).toBeGreaterThan(40)
      expect(stepText(id)).toBe(agoraSteps[id])
    }
  })

  it('uses each cell once, none of the theatre or the sanctuary, with step ids no other plan uses', () => {
    const keys = new Set(agoraCells.map(key))
    expect(keys.size).toBe(agoraCells.length)
    for (const cell of [...theatreCells, ...sanctuaryCells]) expect(keys.has(key(cell))).toBe(false)
    const others = new Set([...theatreCells.map((cell) => cell.mission), ...plans.filter((item) => item !== plan).flatMap((item) => item.steps.map(({ id }) => id))])
    for (const { id } of plan.steps) expect(others.has(id)).toBe(false)
    for (const cell of agoraCells) expect(cell.accept[0]).toBe(cell.block)
  })

  it('follows the decided layout: a 28 × 14 stoa facing south with 7 columns of 2 × 2 and 3 shops', () => {
    expect([STOA.x1 - STOA.x0 + 1, STOA.z1 - STOA.z0 + 1]).toEqual([28, 14])
    expect(COLUMNS).toHaveLength(7)
    const columns = agoraCells.filter((cell) => cell.step === 'colonnade')
    expect(columns).toHaveLength(7 * 4 * COLUMN_HEIGHT)
    for (const cell of columns) {
      expect(cell.block).toBe(cell.y === ENTABLATURE - 1 ? Block.capital : Block.columnDrum)
      // Along the open front, inside the end walls.
      expect(cell.z).toBeGreaterThanOrEqual(STOA.z1 - 2)
      expect(cell.x).toBeGreaterThan(STOA.x0)
      expect(cell.x).toBeLessThan(STOA.x1)
    }
    // Nothing of the walls stands in the open front between the columns.
    const walls = agoraCells.filter((cell) => cell.step === 'stoa' && cell.y >= STOA_FLOOR)
    for (const cell of walls) expect(cell.z).toBeLessThan(STOA.z1 - 2)
    expect(Math.max(...walls.map(({ y }) => y))).toBe(STOA_FLOOR + COLUMN_HEIGHT - 1)
    // Three shops, each with a doorway a player can walk through.
    expect(SHOPS.doors).toHaveLength(3)
    const shopWall = new Set(agoraCells.filter((cell) => cell.step === 'shops').map(key))
    for (const door of SHOPS.doors) for (const x of [door, door + 1]) for (let y = STOA_FLOOR; y < STOA_FLOOR + 4; y++) {
      expect(shopWall.has(key({ x, y, z: SHOPS.front }))).toBe(false)
    }
    // Each shop lies between the walls that divide them.
    const bounds = [STOA.x0, ...SHOPS.walls, STOA.x1]
    SHOPS.doors.forEach((door, i) => {
      expect(door).toBeGreaterThan(bounds[i])
      expect(door + 1).toBeLessThan(bounds[i + 1])
    })
  })

  it('puts a triglyph over every column, and covers the stoa with a symmetrical roof on its walls', () => {
    const frieze = agoraCells.filter((cell) => cell.step === 'stoa-roof' && cell.y === ENTABLATURE + 1 && cell.z === STOA.z1 - 1)
    for (const [x] of COLUMNS) for (const cx of [x, x + 1]) expect(frieze.find((cell) => cell.x === cx)?.block).toBe(Block.triglyph)
    expect(frieze.some((cell) => cell.block === Block.metope)).toBe(true)
    const roof = agoraCells.filter((cell) => cell.step === 'stoa-roof' && cell.block === Block.terracotta)
    expect(roof).toHaveLength(28 * 14)
    for (let z = STOA.z0; z <= STOA.z1; z++) expect(roofHeight(z)).toBe(roofHeight(STOA.z0 + STOA.z1 - z))
    // The eaves rest on something: the cornice at the front, the raised back wall at the back.
    const below = new Set(agoraCells.map(key))
    for (let x = STOA.x0; x <= STOA.x1; x++) for (const z of [STOA.z0, STOA.z1]) expect(below.has(key({ x, y: ROOF - 1, z }))).toBe(true)
  })

  it('stands inside the agora, off the road, with the boundary stones round the open square', () => {
    for (const [x, z] of [[STOA.x0, STOA.z0], [STOA.x1, STOA.z0], [STOA.x0, STOA.z1], [STOA.x1, STOA.z1], ...HOROI]) {
      expect(areaAt(...centre(x, z))?.id, `${x},${z}`).toBe('agora')
    }
    for (const cell of agoraCells) {
      const [x, z] = centre(cell.x, cell.z)
      for (const line of ROADS) expect(nearest(line, x, z).distance).toBeGreaterThan(ROAD_WIDTH + 0.5)
    }
    expect(HOROI).toHaveLength(6)
    expect(area('agora').height * 2 + 16).toBeGreaterThanOrEqual(FLOOR - 1)
  })

  it('starts empty on level grass, with footings on solid ground', () => {
    for (let x = GROUND.x0; x <= GROUND.x1; x += 3) for (let z = GROUND.z0; z <= GROUND.z1; z += 3) {
      if (!agoraCells.some((cell) => cell.x === x && cell.z === z && cell.y === FLOOR)) expect(world.get(x, FLOOR - 1, z), `${x},${z}`).toBe(Block.grass)
      expect(world.get(x, FLOOR + 1, z)).toBe(Block.air)
    }
    const site = measurePlan(world, plan)
    expect(site.wrong).toEqual([])
    expect(site.missing).toHaveLength(agoraCells.length)
    for (const cell of agoraCells.filter((item) => item.footing)) expect(isSolid(world.get(cell.x, cell.y - 1, cell.z))).toBe(true)
  })

  it('counts steps in order, and the agora is finished when every block stands', () => {
    const test = new VoxelWorld()
    expect(activeStep(plan, measurePlan(test, plan).counts)).toBe('horoi')
    for (const cell of agoraCells.filter((item) => item.step !== 'stalls')) test.set(cell.x, cell.y, cell.z, cell.block)
    let site = measurePlan(test, plan)
    expect(activeStep(plan, site.counts)).toBe('stalls')
    for (const cell of agoraCells) test.set(cell.x, cell.y, cell.z, cell.block)
    site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(plan.steps.map(({ id }) => id))
    expect(activeStep(plan, site.counts)).toBeNull()
  })
})

const at = (cells: readonly (readonly [number, number, number])[]) => new Set(cells.map(([x, y, z]) => `${x},${y},${z}`))
const touching = (a: readonly number[], b: readonly number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1

describe('the fountain house, the spring and the pipe', () => {
  it('sets the lion\'s head in the middle of the back wall, pouring into a walled basin', () => {
    const krene = agoraCells.filter((cell) => cell.step === 'krene')
    const spout = krene.filter((cell) => cell.block === Block.lionSpout)
    expect(spout).toEqual([expect.objectContaining({ x: SPOUT.x, y: SPOUT.y, z: SPOUT.z })])
    expect(SPOUT.x).toBe(KRENE.x1)
    expect(SPOUT.z).toBeGreaterThan(BASIN.z0)
    expect(SPOUT.z).toBeLessThan(BASIN.z1)
    // Its only open side is the basin's; the basin is closed by the walls and the parapet at water height.
    const built = new Set(krene.map(key))
    const get = (x: number, y: number, z: number) => built.has(key({ x, y, z })) ? Block.ashlar : Block.air
    expect(spoutOutput(get, SPOUT.x, SPOUT.y, SPOUT.z)).toEqual([SPOUT.x - 1, SPOUT.y, SPOUT.z])
    for (let z = BASIN.z0 - 1; z <= BASIN.z1 + 1; z++) for (let x = BASIN.x0 - 1; x <= BASIN.x1 + 1; x++) {
      const inside = x >= BASIN.x0 && x <= BASIN.x1 && z >= BASIN.z0 && z <= BASIN.z1
      expect(built.has(key({ x, y: FLOOR + 1, z })), `${x},${z}`).toBe(!inside)
      expect(built.has(key({ x, y: FLOOR, z }))).toBe(true)
    }
  })

  it('generates the spring in its rim, and lays a pipe joined face to face from it to the spout', () => {
    for (const [x, y, z] of springCells) expect(world.get(x, y, z)).toBe(Block.water)
    expect(isSpring(...springCells[0]) && !isSpring(SPOUT.x, SPOUT.y, SPOUT.z)).toBe(true)
    expect(springCells.some((cell) => touching(cell, pipeCells[0]))).toBe(true)
    for (let i = 1; i < pipeCells.length; i++) expect(touching(pipeCells[i - 1], pipeCells[i]), `${pipeCells[i]}`).toBe(true)
    expect(touching(pipeCells.at(-1)!, [SPOUT.x, SPOUT.y, SPOUT.z])).toBe(true)
    expect(at(pipeCells).size).toBe(pipeCells.length)
    // It lies in a trench: nothing above it but air until the pipe is laid, and never on the road.
    for (const [x, y, z] of pipeCells) {
      const [px, pz] = centre(x, z)
      expect(onRoad(px, pz), `${x},${z}`).toBe(false)
      for (let k = y; k < y + 6; k++) if (!at(pipeCells).has(`${x},${k},${z}`)) expect(world.get(x, k, z)).toBe(Block.air)
    }
    expect(pipeCells.length).toBeGreaterThan(25)
    // The route's ground heights, kept as data, are the terrain's; the spring sits flush in the slope.
    expect(routeColumns).toHaveLength(ROUTE_GROUND.length)
    for (const [x, z, y] of routeColumns) expect(blockTop(x, z), `${x},${z}`).toBe(y)
    expect(blockTop(SPRING.x0, SPRING.z0)).toBe(SPRING.y)
    expect(areaAt(...centre(SPRING.x0, SPRING.z0))).toBeNull()
  })

  it('runs the spout only while the pipe joins it to the spring, and drains the basin when cut', () => {
    const test = new VoxelWorld()
    const settle = () => { for (let i = 0; i < 200 && test.flowing; i++) test.tickWater() }
    const basinWater = () => {
      let n = 0
      for (let x = BASIN.x0; x <= BASIN.x1; x++) for (let z = BASIN.z0; z <= BASIN.z1; z++) if (isWater(test.get(x, FLOOR + 1, z))) n++
      return n
    }
    const mouth = [SPOUT.x - 1, SPOUT.y, SPOUT.z] as const
    for (const cell of agoraCells.filter((item) => item.step === 'krene')) test.set(cell.x, cell.y, cell.z, cell.block)
    expect(test.get(...mouth)).toBe(Block.air)
    // All but the last section: still dry.
    for (const [x, y, z] of pipeCells.slice(0, -1)) test.set(x, y, z, Block.pipe)
    settle()
    expect(test.get(...mouth)).toBe(Block.air)
    expect(basinWater()).toBe(0)
    test.set(...pipeCells.at(-1)!, Block.pipe)
    expect(test.get(...mouth)).toBe(Block.water)
    settle()
    expect(basinWater()).toBe((BASIN.x1 - BASIN.x0 + 1) * (BASIN.z1 - BASIN.z0 + 1))
    // The water stays in the fountain house.
    for (let x = KRENE.x0 - 2; x <= KRENE.x1; x++) for (let z = KRENE.z0 - 1; z <= KRENE.z1 + 1; z++) {
      const inBasin = x >= BASIN.x0 && x <= BASIN.x1 && z >= BASIN.z0 && z <= BASIN.z1
      if (!inBasin) for (let y = FLOOR; y < KRENE_TOP; y++) if (!(x === mouth[0] && z === mouth[2])) expect(isWater(test.get(x, y, z)), `${x},${y},${z}`).toBe(false)
    }
    // A hydria takes water from the mouth; it fills again.
    test.set(...mouth, Block.air)
    settle()
    expect(test.get(...mouth)).toBe(Block.water)
    // The same after loading the saved edits.
    const copy = new VoxelWorld()
    copy.regenerate(test.edits)
    copy.set(...mouth, Block.air)
    for (let i = 0; i < 20 && copy.flowing; i++) copy.tickWater()
    expect(copy.get(...mouth)).toBe(Block.water)
    // Cut the pipe in the middle: the spout stops and the basin drains.
    test.set(...pipeCells[10], Block.air)
    expect(test.get(...mouth)).toBe(Block.air)
    settle()
    expect(basinWater()).toBe(0)
    // Mend it: water again. Then take the lion's head away: dry, and no source left behind.
    test.set(...pipeCells[10], Block.pipe)
    expect(test.get(...mouth)).toBe(Block.water)
    test.set(SPOUT.x, SPOUT.y, SPOUT.z, Block.air)
    expect(test.get(...mouth)).toBe(Block.air)
  })

  it('keeps the spring running when its water is taken, and stops the fountain while it is blocked', () => {
    const test = new VoxelWorld()
    const [sx, sy, sz] = springCells[0]
    test.set(sx, sy, sz, Block.air)
    for (let i = 0; i < 10 && test.flowing; i++) test.tickWater()
    expect(test.get(sx, sy, sz)).toBe(Block.water)
    // It does not spill into the empty trench beside it.
    test.set(...pipeCells[0], Block.pipe)
    test.set(...pipeCells[0], Block.air)
    for (let i = 0; i < 40 && test.flowing; i++) test.tickWater()
    for (const cell of pipeCells.slice(0, 12)) expect(test.get(...cell)).toBe(Block.air)
    // A spout set straight against the spring runs too, and stops when every spring cell is filled with stone.
    test.set(SPRING.x0 - 1, SPRING.y, SPRING.z0, Block.lionSpout)
    expect(test.get(SPRING.x0 - 2, SPRING.y, SPRING.z0)).toBe(Block.water)
    for (const [x, y, z] of springCells) test.set(x, y, z, Block.limestone)
    expect(test.get(SPRING.x0 - 2, SPRING.y, SPRING.z0)).toBe(Block.air)
  })

  it('sets out three stalls, each with two storage jars and an amphora', () => {
    const stalls = agoraCells.filter((cell) => cell.step === 'stalls')
    expect(STALLS).toHaveLength(3)
    expect(stalls.filter((cell) => cell.block === Block.stall)).toHaveLength(9)
    expect(stalls.filter((cell) => cell.block === Block.pithos)).toHaveLength(6)
    expect(stalls.filter((cell) => cell.block === Block.amphora)).toHaveLength(3)
    for (const cell of stalls) expect(cell.x < KRENE.x0 && cell.z >= SQUARE.z0 && cell.z <= SQUARE.z1).toBe(true)
  })
})
