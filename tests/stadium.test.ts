import { describe, expect, it } from 'vitest'
import { BALBIDES, BANK, BANKS, FLOOR, GROUND, JUDGES, TRACK, stadiumCells } from '../src/game/blueprints/stadium'
import { agoraCells } from '../src/game/blueprints/agora'
import { sanctuaryCells } from '../src/game/blueprints/sanctuary'
import { cells as theatreCells } from '../src/game/blueprints/theatre'
import { activeStep, finishedSteps, measurePlan, planOf, plans, stepReady } from '../src/game/plans'
import { stadiumSteps, stepText } from '../src/game/el'
import { ROADS, ROAD_WIDTH, area, areaAt, nearest } from '../src/game/regions'
import { Block, isSolid } from '../src/voxel/blocks'
import { S, VoxelWorld, wx, wz } from '../src/voxel/world'

const plan = planOf('stadium')!
const world = new VoxelWorld()
const centre = (x: number, z: number) => [wx(x) + S / 2, wz(z) + S / 2] as const
const key = ({ x, y, z }: { x: number; y: number; z: number }) => `${x},${y},${z}`

describe('the stadium plan', () => {
  it('has the 15b steps with cells, the 15c steps still to come, and Greek texts for all', () => {
    expect(plan.steps.map(({ id }) => id)).toEqual(['dromos', 'balbides', 'banks', 'hellanodikai', 'krypte', 'kamptres', 'channel'])
    expect(plan.steps.filter(({ id }) => stepReady(plan, id)).map(({ id }) => id)).toEqual(['dromos', 'balbides', 'banks', 'hellanodikai'])
    for (const { id } of plan.steps) {
      expect(stadiumSteps[id]?.note.length).toBeGreaterThan(40)
      expect(stepText(id)).toBe(stadiumSteps[id])
    }
  })

  it('uses each cell once, none of another building, with step ids no other plan uses', () => {
    const keys = new Set(stadiumCells.map(key))
    expect(keys.size).toBe(stadiumCells.length)
    for (const cell of [...theatreCells, ...sanctuaryCells, ...agoraCells]) expect(keys.has(key(cell))).toBe(false)
    const others = new Set([...theatreCells.map((cell) => cell.mission), ...plans.filter((item) => item !== plan).flatMap((item) => item.steps.map(({ id }) => id))])
    for (const { id } of plan.steps) expect(others.has(id)).toBe(false)
    for (const cell of stadiumCells) expect(cell.accept[0]).toBe(cell.block)
  })

  it('follows the decided size: a sand track of 40 × 4 units with a starting line near each end', () => {
    expect([(TRACK.x1 - TRACK.x0 + 1) * S, (TRACK.z1 - TRACK.z0 + 1) * S]).toEqual([40, 4])
    const track = stadiumCells.filter((cell) => cell.step === 'dromos' || cell.step === 'balbides')
    expect(track).toHaveLength(80 * 8)
    for (const cell of track) expect(cell.y).toBe(FLOOR - 1)
    const sills = stadiumCells.filter((cell) => cell.step === 'balbides')
    expect(sills).toHaveLength(2 * 8)
    expect(new Set(sills.map(({ x }) => x))).toEqual(new Set(BALBIDES))
    expect(sills.every((cell) => cell.block === Block.balbis)).toBe(true)
    expect(stadiumCells.filter((cell) => cell.step === 'dromos').every((cell) => cell.block === Block.sand)).toBe(true)
  })

  it('raises two-step banks on both sides behind a walkway, with the judges\' marble seats on the south bank', () => {
    const banks = stadiumCells.filter((cell) => cell.step === 'banks')
    for (const { near, side } of Object.values(BANKS)) {
      expect(Math.abs(near - (side < 0 ? TRACK.z0 : TRACK.z1))).toBe(3)
      // The lower step is one block high, the upper two.
      const height = (z: number) => Math.max(...stadiumCells.filter((cell) => cell.x === BANK.x0 + 5 && cell.z === z).map(({ y }) => y)) - FLOOR + 1
      expect(height(near)).toBe(1)
      expect(height(near + side * (BANK.depth * 2 - 1))).toBe(2)
    }
    expect(banks.every((cell) => cell.accept.includes(Block.soil) && cell.accept.includes(Block.grass))).toBe(true)
    const judges = stadiumCells.filter((cell) => cell.step === 'hellanodikai')
    expect(judges.every((cell) => cell.block === Block.marble && cell.z > TRACK.z1 && cell.x >= JUDGES.x0 && cell.x <= JUDGES.x1)).toBe(true)
    // A bench and a back above the marble floor.
    expect(Math.max(...judges.map(({ y }) => y))).toBe(FLOOR + 3)
    expect((JUDGES.x0 + JUDGES.x1 + 1) / 2).toBe((TRACK.x0 + TRACK.x1 + 1) / 2)
  })

  it('lies along the stadium valley, off the road, with room for the entrance at the west end', () => {
    const middle = Math.round((TRACK.z0 + TRACK.z1) / 2)
    for (const x of [TRACK.x0, TRACK.x1]) expect(areaAt(...centre(x, middle))?.id).toBe('stadium')
    for (const cell of stadiumCells) {
      const [x, z] = centre(cell.x, cell.z)
      for (const line of ROADS) expect(nearest(line, x, z).distance).toBeGreaterThan(ROAD_WIDTH + 0.5)
    }
    expect(wx(TRACK.x0) - area('stadium').entrance[0]).toBeGreaterThan(4)
  })

  it('starts empty: a sand bed dug in level ground, the banks\' ground cut clear, footings on solid ground', () => {
    for (let x = GROUND.x0; x <= GROUND.x1; x += 4) for (const z of [GROUND.z0, GROUND.z1]) expect(world.get(x, FLOOR - 1, z)).toBe(Block.grass)
    const site = measurePlan(world, plan)
    expect(site.wrong).toEqual([])
    expect(site.missing).toHaveLength(stadiumCells.length)
    for (const cell of stadiumCells.filter((item) => item.footing)) expect(isSolid(world.get(cell.x, cell.y - 1, cell.z)), key(cell)).toBe(true)
    // Nothing hangs over the banks where the hills were cut back.
    for (const cell of stadiumCells.filter((item) => item.open)) for (let y = cell.y; y < cell.y + 8; y++) {
      if (!stadiumCells.some((other) => other.x === cell.x && other.z === cell.z && other.y === y)) expect(world.get(cell.x, y, cell.z)).toBe(Block.air)
    }
  })

  it('counts steps in order and stops before the entrance tunnel of 15c', () => {
    const test = new VoxelWorld()
    expect(activeStep(plan, measurePlan(test, plan).counts)).toBe('dromos')
    for (const cell of stadiumCells) test.set(cell.x, cell.y, cell.z, cell.block)
    const site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(['dromos', 'balbides', 'banks', 'hellanodikai'])
    expect(activeStep(plan, site.counts)).toBe('krypte')
    expect(stadiumCells.length).toBeGreaterThan(1500)
    expect(stadiumCells.length).toBeLessThan(2600)
  })
})
