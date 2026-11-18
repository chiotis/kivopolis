import { describe, expect, it } from 'vitest'
import { BALBIDES, BANK, BANKS, CHANNEL, FLOOR, GROUND, JUDGES, KAMPTER_X, KAMPTRES, KRYPTE, SLOPE_GROUND, SPOUTS, SPRING, TRACK, pipeCells, springCells, stadiumCells } from '../src/game/blueprints/stadium'
import { isSpring } from '../src/voxel/plumbing'
import { blockTop } from '../src/game/terrain'
import { agoraCells } from '../src/game/blueprints/agora'
import { sanctuaryCells } from '../src/game/blueprints/sanctuary'
import { cells as theatreCells } from '../src/game/blueprints/theatre'
import { activeStep, finishedSteps, measurePlan, planOf, plans, stepReady } from '../src/game/plans'
import { stadiumSteps, stepText } from '../src/game/el'
import { ROADS, ROAD_WIDTH, area, areaAt, nearest, onRoad } from '../src/game/regions'
import { Block, isSolid, isWater } from '../src/voxel/blocks'
import { S, VoxelWorld, wx, wz } from '../src/voxel/world'

const plan = planOf('stadium')!
const world = new VoxelWorld()
const centre = (x: number, z: number) => [wx(x) + S / 2, wz(z) + S / 2] as const
const key = ({ x, y, z }: { x: number; y: number; z: number }) => `${x},${y},${z}`

describe('the stadium plan', () => {
  it('has seven steps, all with cells, and Greek texts for each', () => {
    expect(plan.steps.map(({ id }) => id)).toEqual(['dromos', 'balbides', 'banks', 'hellanodikai', 'krypte', 'kamptres', 'channel'])
    expect(plan.steps.every(({ id }) => stepReady(plan, id))).toBe(true)
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
    // The road runs into the vaulted entrance; everything else keeps off it.
    for (const cell of stadiumCells.filter((item) => item.step !== 'krypte')) {
      const [x, z] = centre(cell.x, cell.z)
      for (const line of ROADS) expect(nearest(line, x, z).distance).toBeGreaterThan(ROAD_WIDTH + 0.5)
    }
    expect(wx(TRACK.x0) - area('stadium').entrance[0]).toBeGreaterThan(4)
  })

  it('starts empty: a sand bed dug in level ground, the banks\' ground cut clear, footings on solid ground', () => {
    for (let x = GROUND.x0; x <= GROUND.x1; x += 4) expect(world.get(x, FLOOR - 1, GROUND.z1)).toBe(Block.grass)
    const site = measurePlan(world, plan)
    expect(site.wrong).toEqual([])
    expect(site.missing).toHaveLength(stadiumCells.length)
    for (const cell of stadiumCells.filter((item) => item.footing)) expect(isSolid(world.get(cell.x, cell.y - 1, cell.z)), key(cell)).toBe(true)
    // Nothing hangs over the banks where the hills were cut back.
    for (const cell of stadiumCells.filter((item) => item.open)) for (let y = cell.y; y < cell.y + 8; y++) {
      if (!stadiumCells.some((other) => other.x === cell.x && other.z === cell.z && other.y === y)) expect(world.get(cell.x, y, cell.z)).toBe(Block.air)
    }
  })

  it('counts steps in order, and the stadium is finished when every block stands and the water runs', () => {
    const test = new VoxelWorld()
    expect(activeStep(plan, measurePlan(test, plan).counts)).toBe('dromos')
    for (const cell of stadiumCells.filter((item) => item.block !== Block.water)) test.set(cell.x, cell.y, cell.z, cell.block)
    expect(activeStep(plan, measurePlan(test, plan).counts)).toBe('channel')
    for (let i = 0; i < 300 && test.flowing; i++) test.tickWater()
    const site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(plan.steps.map(({ id }) => id))
    expect(activeStep(plan, site.counts)).toBeNull()
    expect(stadiumCells.length).toBeLessThan(2600)
  })
})

const touching = (a: readonly number[], b: readonly number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1

describe('the stadium\'s entrance, turning posts and water', () => {
  it('builds a vaulted entrance in line with the road, high enough to walk through', () => {
    const krypte = stadiumCells.filter((cell) => cell.step === 'krypte')
    expect(krypte.filter((cell) => cell.block === Block.voussoir)).toHaveLength(8 * 8)
    expect(KRYPTE.x1).toBe(TRACK.x0 - 1)
    const [ex, ez] = area('stadium').entrance
    expect(Math.abs(ez - (wz(KRYPTE.z0) + wz(KRYPTE.z1 + 1)) / 2)).toBeLessThan(0.6)
    expect(wx(KRYPTE.x0) - ex).toBeLessThan(2)
    // The way in is clear in the generated island, from the road's end through to the track.
    for (let x = KRYPTE.x0 - 4; x <= KRYPTE.x1; x++) for (const z of [KRYPTE.z0 + 2, KRYPTE.z1 - 2]) {
      for (let y = FLOOR; y < FLOOR + 4; y++) expect(world.get(x, y, z), `${x},${y},${z}`).toBe(Block.air)
    }
    // Its boundary stones stand either side of the mouth, off the road.
    for (const [x, z] of area('stadium').stones!) {
      expect(onRoad(x, z)).toBe(false)
      expect(Math.abs(z - ez)).toBeGreaterThan(1)
    }
    // Under the keystones the passage is four blocks high, with the walls either side.
    const cells = new Set(krypte.map(key))
    for (let x = KRYPTE.x0; x <= KRYPTE.x1; x++) for (const z of [KRYPTE.z0 + 2, KRYPTE.z1 - 2]) {
      for (let y = FLOOR; y < FLOOR + 4; y++) expect(cells.has(key({ x, y, z }))).toBe(false)
      expect(cells.has(key({ x, y: FLOOR + 4, z }))).toBe(true)
    }
  })

  it('sets four turning posts beyond the east end of the track, one per lane', () => {
    const posts = stadiumCells.filter((cell) => cell.step === 'kamptres')
    expect(posts).toHaveLength(4 * 3)
    expect(posts.every((cell) => cell.x === KAMPTER_X && cell.x > TRACK.x1)).toBe(true)
    expect(KAMPTRES.map((z) => z - TRACK.z0)).toEqual([0, 2, 5, 7])
  })

  it('generates the second spring, and joins it face to face to every lion\'s head by pipe', () => {
    for (const [x, y, z] of springCells) expect(world.get(x, y, z)).toBe(Block.water)
    expect(isSpring(...springCells[0])).toBe(true)
    expect(springCells.some((cell) => touching(cell, pipeCells[0]))).toBe(true)
    for (let i = 1; i < pipeCells.length; i++) {
      // The run down the slope and the run east meet at a corner; every other section follows the one before.
      expect(pipeCells.slice(0, i).some((cell) => touching(cell, pipeCells[i])), `${pipeCells[i]}`).toBe(true)
    }
    for (const x of SPOUTS) expect(pipeCells.some((cell) => touching(cell, [x, CHANNEL.y, CHANNEL.kerb]))).toBe(true)
    // The ground under the run down the slope is the terrain's, and the pipe keeps off the road.
    SLOPE_GROUND.forEach((y, i) => expect(blockTop(SPRING.x0, SPRING.z1 + 2 + i)).toBe(y))
    expect(blockTop(SPRING.x0, SPRING.z0)).toBe(SPRING.y)
    for (const [x, , z] of pipeCells) expect(onRoad(...centre(x, z))).toBe(false)
    // It never runs under a bank, so a finished bank need not be dug up.
    const banks = new Set(stadiumCells.filter((cell) => cell.step === 'banks').map(({ x, z }) => `${x},${z}`))
    for (const [x, , z] of pipeCells) expect(banks.has(`${x},${z}`)).toBe(false)
  })

  it('fills the whole channel from its six spouts once the pipe is joined, and keeps the water in it', () => {
    const test = new VoxelWorld()
    const settle = () => { for (let i = 0; i < 300 && test.flowing; i++) test.tickWater() }
    // The track is built first: its sand is the channel's inner side.
    for (const cell of stadiumCells.filter((item) => item.step === 'dromos' || item.step === 'balbides')) test.set(cell.x, cell.y, cell.z, cell.block)
    const channel = stadiumCells.filter((cell) => cell.step === 'channel' && cell.block !== Block.water)
    for (const cell of channel.filter((item) => item.block !== Block.pipe)) test.set(cell.x, cell.y, cell.z, cell.block)
    const pipes = pipeCells.slice()
    for (const [x, y, z] of pipes.slice(0, -1)) test.set(x, y, z, Block.pipe)
    settle()
    // The last spout's pipe section is missing: it stays dry, the others run.
    const last = SPOUTS.at(-1)!
    expect(test.get(last, CHANNEL.y, CHANNEL.z)).not.toBe(Block.water)
    expect(test.get(SPOUTS[0], CHANNEL.y, CHANNEL.z)).toBe(Block.water)
    test.set(...pipes.at(-1)!, Block.pipe)
    settle()
    for (let x = CHANNEL.x0; x <= CHANNEL.x1; x++) expect(isWater(test.get(x, CHANNEL.y, CHANNEL.z)), `${x}`).toBe(true)
    // Nothing spills onto the track, the walkway or past the ends.
    for (let x = CHANNEL.x0 - 2; x <= CHANNEL.x1 + 2; x++) for (const z of [CHANNEL.z - 2, CHANNEL.z + 1, CHANNEL.z + 2]) {
      expect(isWater(test.get(x, CHANNEL.y, z)) || isWater(test.get(x, CHANNEL.y + 1, z)), `${x},${z}`).toBe(false)
    }
    for (const x of [CHANNEL.x0 - 2, CHANNEL.x1 + 2]) expect(isWater(test.get(x, CHANNEL.y, CHANNEL.z))).toBe(false)
  })
})
