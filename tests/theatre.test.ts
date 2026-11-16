import { beforeEach, describe, expect, it } from 'vitest'
import { cells, cellTotals, legacySlots, missionCells } from '../src/game/blueprints/theatre'
import { activeMission, earnedPoints, materials, measure, missionCounts, partStates, useSite } from '../src/game/site'
import { migrateLegacy, useGame } from '../src/game/store'
import { canWalk, obstacles } from '../src/game/terrain'
import { objectives } from '../src/game/theatre'
import { Block } from '../src/voxel/blocks'
import { inQuarry } from '../src/voxel/generate'
import { S, SX, SY, SZ, wx, wz } from '../src/voxel/grid'
import { OY, getWorld } from '../src/voxel/world'

const fill = (mission: string, id?: number) => {
  const world = getWorld()
  for (const cell of cells) if (cell.mission === mission) world.set(cell.x, cell.y, cell.z, id ?? cell.block)
}

describe('theatre blueprint', () => {
  it('gives every mission its own distinct blocks', () => {
    expect(new Set(cells.map(({ x, y, z }) => `${x},${y},${z}`)).size).toBe(cells.length)
    expect(cellTotals).toEqual({
      discover: 0, orchestra: 48, analemmata: 114, seats: 64, diazoma: 94, koilon: 100, stairs: 74, skene: 122, finish: 26,
    })
    for (const cell of cells) expect(cell.accept[0]).toBe(cell.block)
    // All four seat rows and both stairways are marble, and only marble completes them.
    for (const mission of ['seats', 'koilon', 'stairs'] as const) {
      expect(missionCells(mission).every((cell) => cell.block === Block.marble && cell.accept.length === 1)).toBe(true)
    }
    const lower = missionCells('seats')
    expect(new Set(lower.map((cell) => cell.y))).toEqual(new Set([OY, OY + 1]))
    // The diazoma takes the third terrace, so the upper tier starts a block higher.
    expect(new Set(missionCells('koilon').map((cell) => cell.y))).toEqual(new Set([OY + 3, OY + 4]))
    // The diazoma is one level course of gravel on the third terrace.
    expect(missionCells('diazoma').every((cell) => cell.block === Block.gravel && cell.y === OY + 1)).toBe(true)
    // The analemmata close both sides and rise one course above the top row.
    const walls = missionCells('analemmata')
    expect(new Set(walls.map((cell) => cell.legacy))).toEqual(new Set(['analemma-left', 'analemma-right']))
    expect(Math.max(...walls.map((cell) => cell.y))).toBe(OY + 5)
    // Stairs climb every terrace, the diazoma included.
    expect(new Set(missionCells('stairs').map((cell) => cell.y))).toEqual(new Set([OY - 1, OY, OY + 1, OY + 2, OY + 3]))
  })

  it('starts as an empty, supported building site', () => {
    const world = getWorld()
    world.regenerate()
    const { counts, missing, wrong } = measure(world)
    expect(Object.values(counts).every((count) => count === 0)).toBe(true)
    expect(wrong).toHaveLength(0)
    expect(missing).toHaveLength(cells.length)
    for (const cell of cells.filter((item) => item.footing)) expect(world.solidAt(cell.x, cell.y - 1, cell.z)).toBe(true)
  })

  it('leaves enough quarry marble for every marble cell', () => {
    const world = getWorld()
    world.regenerate()
    let stock = 0
    for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
      if (!inQuarry(wx(x) + S / 2, wz(z) + S / 2)) continue
      for (let y = 1; y < SY; y++) if (world.get(x, y, z) === Block.marble) stock++
    }
    const needed = cells.filter((cell) => cell.block === Block.marble).length
    expect(needed).toBe(248)
    expect(stock).toBeGreaterThan(needed * 2)
  })

  it('keeps the ocean edge closed and the site approach open', () => {
    expect(canWalk(90, 0, obstacles)).toBe(false)
    expect(canWalk(6.5, 8, obstacles)).toBe(true)
  })
})

describe('missions counted from world blocks', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().start()
    useGame.getState().updatePlayer([6.4, 0, 7.8])
    useGame.getState().interact()
    // Activating the plan opens the orchestra, the first step to build.
    expect(useGame.getState()).toMatchObject({ panel: 'part', part: 'orchestra', congrats: 'discover' })
    useGame.getState().setPanel(null)
  })

  it('advances when every cell holds an accepted block and goes back when one breaks', () => {
    const world = getWorld()
    expect(useGame.getState().progress.discovered).toBe(true)
    fill('orchestra')
    let { counts } = useSite.getState()
    expect(activeMission(true, counts)).toBe('analemmata')
    expect(earnedPoints(true, counts, false)).toBe(100)
    // The finished step is congratulated in the window of the next one.
    expect(useGame.getState()).toMatchObject({ panel: 'part', part: 'analemmata', congrats: 'orchestra', milestone: null })
    expect(useGame.getState().progress.celebrated).toEqual(['orchestra'])
    useGame.getState().setPanel(null)
    expect(useGame.getState().congrats).toBeNull()

    const [first] = missionCells('orchestra')
    world.set(first.x, first.y, first.z, Block.air)
    counts = useSite.getState().counts
    expect(activeMission(true, counts)).toBe('orchestra')
    expect(missionCounts('orchestra', counts)).toEqual({ done: 47, total: 48 })
    expect(earnedPoints(true, counts, false)).toBe(0)

    // Marble also completes a ring cell; a wrong block shows up in the red list instead.
    world.set(first.x, first.y, first.z, Block.soil)
    expect(useSite.getState().wrong).toContain(cells.indexOf(first))
    useGame.getState().dismissMilestone()
    world.set(first.x, first.y, first.z, Block.marble)
    expect(activeMission(true, useSite.getState().counts)).toBe('analemmata')
    // Rebuilding a finished mission does not celebrate it twice.
    expect(useGame.getState().milestone).toBeNull()
    expect(useGame.getState().panel).toBeNull()
  })

  it('opens the tour only once both gateways stand', () => {
    for (const { id } of objectives) if (id !== 'discover' && id !== 'finish') fill(id)
    useGame.getState().setPanel(null)
    expect(activeMission(true, useSite.getState().counts)).toBe('finish')
    useGame.getState().updatePlayer([-6.15, 0, 3.7])
    useGame.getState().interact()
    expect(useGame.getState().mode).toBe('explore')
    fill('finish')
    useGame.getState().interact()
    expect(useGame.getState().mode).toBe('tour')
  })

  it('marks each part of the theatre as done, active or still ahead', () => {
    fill('orchestra')
    fill('analemmata')
    const states = partStates(true, false, useSite.getState().counts)
    expect(objectives.map(({ id }) => states[id])).toEqual(['done', 'done', 'done', 'active', 'todo', 'todo', 'todo', 'todo', 'todo'])
    expect(Object.values(partStates(false, false, useSite.getState().counts)).filter((state) => state === 'active')).toHaveLength(1)
    expect(partStates(false, false, useSite.getState().counts).discover).toBe('active')
    expect(Object.values(partStates(true, true, useSite.getState().counts)).every((state) => state !== 'active')).toBe(true)
  })

  it('lists each material of a mission as placed out of total', () => {
    const world = getWorld()
    for (const cell of missionCells('skene')) if (cell.y === OY) world.set(cell.x, cell.y, cell.z, cell.block)
    const { missing, wrong } = useSite.getState()
    const rows = Object.fromEntries(materials('skene', missing, wrong).map(({ block, placed, total }) => [block, [placed, total]]))
    // The foundation counts towards ashlar; the posts and the roof are still untouched.
    expect(rows).toEqual({ [Block.ashlar]: [40, 74], [Block.terracotta]: [0, 40], [Block.oliveLog]: [0, 8] })
  })

  it('gives the blocks back when a mission is restarted', () => {
    fill('orchestra')
    fill('analemmata')
    const [cell] = missionCells('seats')
    getWorld().set(cell.x, cell.y, cell.z, Block.marble)
    useGame.getState().restartMission()
    expect(missionCounts('seats', useSite.getState().counts).done).toBe(0)
    expect(missionCounts('orchestra', useSite.getState().counts).done).toBe(48)
  })
})

describe('saves from the prefab era', () => {
  beforeEach(() => useGame.getState().reset())

  it('rebuilds finished missions in full and placed pieces cell by cell', () => {
    migrateLegacy([...legacySlots.orchestra, 'seat-0-1-2', 'gate-left'])
    const { counts } = useSite.getState()
    expect(counts.orchestra).toBe(cellTotals.orchestra)
    expect(counts.seats).toBeGreaterThan(0)
    expect(counts.seats).toBeLessThan(cellTotals.seats)
    expect(counts.finish).toBe(cellTotals.finish / 2)
    expect(counts.koilon).toBe(0)
  })
})
