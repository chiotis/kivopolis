import { describe, expect, it } from 'vitest'
import { COLUMNS, COLUMN_HEIGHT, ENTABLATURE, FLOOR, GROUND, HOROI, ROOF, SHOPS, STOA, STOA_FLOOR, agoraCells, roofHeight } from '../src/game/blueprints/agora'
import { sanctuaryCells } from '../src/game/blueprints/sanctuary'
import { cells as theatreCells } from '../src/game/blueprints/theatre'
import { activeStep, finishedSteps, measurePlan, planOf, plans, stepReady } from '../src/game/plans'
import { agoraSteps, stepText } from '../src/game/el'
import { ROADS, ROAD_WIDTH, areaAt, area, nearest } from '../src/game/regions'
import { Block, isSolid } from '../src/voxel/blocks'
import { VoxelWorld, S, wx, wz } from '../src/voxel/world'

const plan = planOf('agora')!
const world = new VoxelWorld()
const centre = (x: number, z: number) => [wx(x) + S / 2, wz(z) + S / 2] as const
const key = ({ x, y, z }: { x: number; y: number; z: number }) => `${x},${y},${z}`

describe('the agora plan', () => {
  it('has the 14b steps with cells, the 14c steps still to come, and Greek texts for all', () => {
    expect(plan.steps.map(({ id }) => id)).toEqual(['horoi', 'stoa', 'colonnade', 'shops', 'stoa-roof', 'krene', 'stalls'])
    expect(plan.steps.filter(({ id }) => stepReady(plan, id)).map(({ id }) => id)).toEqual(['horoi', 'stoa', 'colonnade', 'shops', 'stoa-roof'])
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

  it('counts steps in order and stops before the fountain house of 14c', () => {
    const test = new VoxelWorld()
    expect(activeStep(plan, measurePlan(test, plan).counts)).toBe('horoi')
    for (const cell of agoraCells) test.set(cell.x, cell.y, cell.z, cell.block)
    const site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(['horoi', 'stoa', 'colonnade', 'shops', 'stoa-roof'])
    expect(activeStep(plan, site.counts)).toBe('krene')
    expect(agoraCells.length).toBeGreaterThan(1200)
    expect(agoraCells.length).toBeLessThan(2400)
  })
})
