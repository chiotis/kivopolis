import { describe, expect, it } from 'vitest'
import { ALTAR, CELLA, FLOOR, GATE, KREPIS, STYLOBATE, TEMPLE_FLOOR, WALL, sanctuaryCells, sanctuaryCore } from '../src/game/blueprints/sanctuary'
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
  it('has eight steps, the first four with cells, each with Greek texts', () => {
    expect(plan.steps.map(({ id }) => id)).toEqual(['peribolos', 'altar', 'krepis', 'cella', 'columns', 'entablature', 'roof', 'statue'])
    expect(plan.steps.map(({ id }) => stepReady(plan, id))).toEqual([true, true, true, true, false, false, false, false])
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
    // The stylobate's marble band is two blocks wide, room for the 2 × 2 columns.
    const band = sanctuaryCells.filter((cell) => cell.step === 'krepis' && cell.y === FLOOR + 2 && cell.block === Block.marble)
    expect(band).toHaveLength(24 * 16 - 20 * 12)
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
    // With the first four built, the next step is one still to come.
    for (const cell of sanctuaryCells) test.set(cell.x, cell.y, cell.z, cell.block)
    site = measurePlan(test, plan)
    expect(finishedSteps(plan, site.counts)).toEqual(['peribolos', 'altar', 'krepis', 'cella'])
    expect(activeStep(plan, site.counts)).toBe('columns')
    void bx; void bz
  })
})
