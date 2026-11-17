import { describe, expect, it } from 'vitest'
import { ALTAR, CELLA, COLUMNS, COLUMN_HEIGHT, ENTABLATURE, FLOOR, GATE, KREPIS, ROOF, STATUE, STYLOBATE, TEMPLE_FLOOR, WALL, roofHeight, sanctuaryCells, sanctuaryCore } from '../src/game/blueprints/sanctuary'
import { activeStep, cellsOfStep, finishedSteps, isStep, measurePlan, planOf, stepMaterials, stepReady, stepTotal } from '../src/game/plans'
import { cells as theatreCells } from '../src/game/blueprints/theatre'
import { area, areaAt, ROADS, STREAM, STREAM_WIDTH, nearest, onRoad } from '../src/game/regions'
import { Block, isSolid } from '../src/voxel/blocks'
import { VoxelWorld, bx, bz, wx, wz, S } from '../src/voxel/world'
import { sanctuarySteps } from '../src/game/el'

const plan = planOf('sanctuary')!
const world = new VoxelWorld()
const centre = (x: number, z: number) => [wx(x) + S / 2, wz(z) + S / 2] as const

describe('the sanctuary plan', () => {
  it('has eight steps, all with cells, each with Greek texts', () => {
    expect(plan.steps.map(({ id }) => id)).toEqual(['peribolos', 'altar', 'krepis', 'cella', 'columns', 'entablature', 'roof', 'statue'])
    expect(plan.steps.every(({ id }) => stepReady(plan, id))).toBe(true)
    for (const { id } of plan.steps) expect(sanctuarySteps[id]?.note.length).toBeGreaterThan(40)
  })

  it('uses each cell once, never one of the theatre, with step ids the theatre does not use', () => {
    const key = ({ x, y, z }: { x: number; y: number; z: number }) => `${x},${y},${z}`
    const keys = new Set(sanctuaryCells.map(key))
    expect(keys.size).toBe(sanctuaryCells.length)
    for (const cell of theatreCells) expect(keys.has(key(cell))).toBe(false)
    for (const { id } of plan.steps) expect(theatreCells.some((cell) => cell.mission === id)).toBe(false)
    for (const cell of sanctuaryCells) expect(cell.accept[0]).toBe(cell.block)
    expect(isStep('krepis') && isStep('orchestra') && !isStep('nonsense')).toBe(true)
    expect(cellsOfStep('altar')).toHaveLength(stepTotal(plan, 'altar'))
  })

  it('follows the decided layout: an east-facing temple on a 28 × 20 krepis, its altar in front, 2 × 2 columns to come', () => {
    expect([KREPIS.x1 - KREPIS.x0 + 1, KREPIS.z1 - KREPIS.z0 + 1]).toEqual([28, 20])
    expect([STYLOBATE.x1 - STYLOBATE.x0 + 1, STYLOBATE.z1 - STYLOBATE.z0 + 1]).toEqual([24, 16])
    expect(ALTAR.x0).toBeGreaterThan(KREPIS.x1)
    expect((ALTAR.z0 + ALTAR.z1) / 2).toBeCloseTo((KREPIS.z0 + KREPIS.z1) / 2)
    expect(CELLA.door).toBeGreaterThan(CELLA.x0)
    expect(TEMPLE_FLOOR).toBe(FLOOR + 3)
    // The stylobate's marble band is three blocks wide: the 2 × 2 columns stand one block in from its edge.
    const band = sanctuaryCells.filter((cell) => cell.step === 'krepis' && cell.y === FLOOR + 2 && cell.block === Block.marble)
    expect(band).toHaveLength(24 * 16 - 18 * 10)
  })

  it('lies inside the widened terrace, clear of the stream, with the road through both gateways', () => {
    // The middle of each wall lies in the area (its corners are levelled by the generator itself).
    const midX = Math.round((WALL.x0 + WALL.x1) / 2), midZ = Math.round((WALL.z0 + WALL.z1) / 2)
    for (const [x, z] of [[WALL.x0, midZ], [WALL.x1, midZ], [midX, WALL.z0], [midX, WALL.z1]]) expect(areaAt(...centre(x, z))?.id).toBe('sanctuary')
    // No part of the sacred ground reaches into the stream's cut.
    for (const [x, z] of [[WALL.x0, WALL.z0], [WALL.x1, WALL.z0], [WALL.x0, WALL.z1], [WALL.x1, WALL.z1], [WALL.x1, midZ]]) {
      expect(nearest(STREAM, ...centre(x, z)).distance).toBeGreaterThan(STREAM_WIDTH.cut + 0.5)
    }
    const gate = (GATE.z0 + GATE.z1 + 1) / 2
    const [eastX] = centre(WALL.x1 + 1, 0), [westX] = centre(WALL.x0 - 1, 0)
    expect(Math.abs(area('sanctuary').entrance[1] - wz(gate))).toBeLessThan(1)
    expect(onRoad(area('sanctuary').entrance[0], area('sanctuary').entrance[1])).toBe(true)
    expect(Math.hypot(ROADS[1][0][0] - westX, ROADS[1][0][1] - wz(gate))).toBeLessThan(1.2)
    expect(eastX).toBeGreaterThan(westX)
  })

  it('starts empty on level grass, with the temple core heaped up and footings on solid ground', () => {
    for (let x = WALL.x0; x <= WALL.x1; x += 4) for (let z = WALL.z0; z <= WALL.z1; z += 4) {
      const inside = sanctuaryCore.some(([cx, , cz]) => cx === x && cz === z)
      if (!inside) expect(world.get(x, FLOOR - 1, z), `${x},${z}`).toBe(Block.grass)
    }
    for (const [x, y, z] of sanctuaryCore) expect(world.get(x, y, z)).toBe(Block.soil)
    const site = measurePlan(world, plan)
    expect(site.wrong).toEqual([])
    expect(site.missing).toHaveLength(sanctuaryCells.length)
    for (const cell of sanctuaryCells.filter((item) => item.footing)) expect(isSolid(world.get(cell.x, cell.y - 1, cell.z))).toBe(true)
  })

  it('counts steps from the world in order, and lists their materials', () => {
    const test = new VoxelWorld()
    expect(activeStep(plan, measurePlan(test, plan).counts)).toBe('peribolos')
    for (const cell of sanctuaryCells.filter((item) => item.step === 'peribolos')) test.set(cell.x, cell.y, cell.z, cell.block)
    let site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(['peribolos'])
    expect(activeStep(plan, site.counts)).toBe('altar')
    // Building the cella first does not skip the altar and the krepis.
    for (const cell of sanctuaryCells.filter((item) => item.step === 'cella')) test.set(cell.x, cell.y, cell.z, cell.accept.at(-1)!)
    site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(['peribolos'])
    const materials = stepMaterials(plan, 'altar', site)
    expect(materials.map(({ block }) => block).sort()).toEqual([Block.marble, Block.ashlar].sort())
    expect(materials.every(({ placed }) => placed === 0)).toBe(true)
    // With every block in place, every step is finished.
    for (const cell of sanctuaryCells) test.set(cell.x, cell.y, cell.z, cell.block)
    site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(plan.steps.map(({ id }) => id))
    expect(activeStep(plan, site.counts)).toBeNull()
    void bx; void bz
  })

  it('raises 16 Doric columns, 2 × 2 blocks and as tall as the cella, on the marble band of the stylobate', () => {
    expect(COLUMNS).toHaveLength(16)
    const columns = sanctuaryCells.filter((cell) => cell.step === 'columns')
    expect(columns).toHaveLength(16 * 4 * COLUMN_HEIGHT)
    const band = new Set(sanctuaryCells.filter((cell) => cell.step === 'krepis' && cell.block === Block.marble).map(({ x, z }) => `${x},${z}`))
    for (const cell of columns) expect(band.has(`${cell.x},${cell.z}`)).toBe(true)
    for (const cell of columns) expect(cell.block).toBe(cell.y === TEMPLE_FLOOR + COLUMN_HEIGHT - 1 ? Block.capital : Block.columnDrum)
    const cellaTop = Math.max(...sanctuaryCells.filter((cell) => cell.step === 'cella').map(({ y }) => y))
    expect(cellaTop).toBe(TEMPLE_FLOOR + COLUMN_HEIGHT - 1)
    // Four along each end, six along each side.
    expect(new Set(COLUMNS.map(([x]) => x)).size).toBe(6)
    expect(new Set(COLUMNS.map(([, z]) => z)).size).toBe(4)
  })

  it('puts a triglyph over every column in the frieze, with metopes between them', () => {
    const frieze = sanctuaryCells.filter((cell) => cell.step === 'entablature' && cell.y === ENTABLATURE + 1)
    const at = (x: number, z: number) => frieze.find((cell) => cell.x === x && cell.z === z)?.block
    for (const [x, z] of COLUMNS) {
      const outer: [number, number][] = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]
      const face = outer.map(([cx, cz]) => at(cx, cz)).filter((block) => block === Block.triglyph || block === Block.metope)
      expect(face.length, `${x},${z}`).toBeGreaterThan(0)
      expect(face.every((block) => block === Block.triglyph)).toBe(true)
    }
    expect(frieze.some((cell) => cell.block === Block.metope)).toBe(true)
  })

  it('covers the temple with a symmetrical tiled roof on pediments, and puts the statue in the cella facing the door', () => {
    const roof = sanctuaryCells.filter((cell) => cell.step === 'roof' && cell.block === Block.terracotta)
    expect(roof).toHaveLength((STYLOBATE.x1 - STYLOBATE.x0 + 1) * (STYLOBATE.z1 - STYLOBATE.z0 + 1))
    for (let z = STYLOBATE.z0; z <= STYLOBATE.z1; z++) expect(roofHeight(z)).toBe(roofHeight(STYLOBATE.z0 + STYLOBATE.z1 - z))
    expect(roofHeight(STYLOBATE.z0)).toBe(ROOF)
    const statue = sanctuaryCells.filter((cell) => cell.step === 'statue')
    for (const cell of statue) {
      expect(cell.x).toBeGreaterThan(CELLA.x0)
      expect(cell.x).toBeLessThan(CELLA.door)
      expect(cell.z).toBeGreaterThan(CELLA.z0)
      expect(cell.z).toBeLessThan(CELLA.z1)
    }
    expect(statue.filter((cell) => cell.block === Block.statueBase)).toHaveLength((STATUE.x1 - STATUE.x0 + 1) * (STATUE.z1 - STATUE.z0 + 1))
    expect(statue.filter((cell) => cell.block === Block.bronze).length).toBeGreaterThan(25)
  })
})
