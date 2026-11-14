import { beforeEach, describe, expect, it } from 'vitest'
import { cells, cellTotals, legacySlots, missionCells } from '../src/game/blueprints/theatre'
import { activeMission, earnedPoints, measure, missionCounts, useSite } from '../src/game/site'
import { migrateLegacy, useGame } from '../src/game/store'
import { canWalk, obstacles } from '../src/game/terrain'
import { objectives } from '../src/game/theatre'
import { Block } from '../src/voxel/blocks'
import { OY, getWorld } from '../src/voxel/world'

const fill = (mission: string, id?: number) => {
  const world = getWorld()
  for (const cell of cells) if (cell.mission === mission) world.set(cell.x, cell.y, cell.z, id ?? cell.block)
}

describe('theatre blueprint', () => {
  it('gives every mission its own distinct blocks', () => {
    expect(new Set(cells.map(({ x, y, z }) => `${x},${y},${z}`)).size).toBe(cells.length)
    expect(cellTotals).toEqual({ discover: 0, orchestra: 48, seats: 64, koilon: 100, stairs: 74, skene: 122, finish: 26 })
    for (const cell of cells) expect(cell.accept[0]).toBe(cell.block)
    // The lower tier: a marble front row, then limestone one block up.
    const lower = missionCells('seats')
    expect(lower.filter((cell) => cell.y === OY).every((cell) => cell.block === Block.marble)).toBe(true)
    expect(lower.filter((cell) => cell.y === OY + 1).every((cell) => cell.block === Block.limestone)).toBe(true)
    expect(new Set(lower.map((cell) => cell.y))).toEqual(new Set([OY, OY + 1]))
    // The diazoma takes the third terrace, so the upper tier starts a block higher.
    expect(new Set(missionCells('koilon').map((cell) => cell.y))).toEqual(new Set([OY + 3, OY + 4]))
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

  it('keeps the ocean edge closed and the site approach open', () => {
    expect(canWalk(38, 0, obstacles)).toBe(false)
    expect(canWalk(6.5, 8, obstacles)).toBe(true)
  })
})

describe('missions counted from world blocks', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().start()
    useGame.getState().updatePlayer([6.4, 0, 7.8])
    useGame.getState().interact()
  })

  it('advances when every cell holds an accepted block and goes back when one breaks', () => {
    const world = getWorld()
    expect(useGame.getState().progress.discovered).toBe(true)
    fill('orchestra')
    let { counts } = useSite.getState()
    expect(activeMission(true, counts)).toBe('seats')
    expect(earnedPoints(true, counts, false)).toBe(100)
    expect(useGame.getState().milestone).toBe('orchestra')
    expect(useGame.getState().progress.celebrated).toEqual(['orchestra'])

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
    expect(activeMission(true, useSite.getState().counts)).toBe('seats')
    // Rebuilding a finished mission does not celebrate it twice.
    expect(useGame.getState().milestone).toBeNull()
  })

  it('opens the tour only once both gateways stand', () => {
    for (const { id } of objectives) if (id !== 'discover' && id !== 'finish') fill(id)
    expect(activeMission(true, useSite.getState().counts)).toBe('finish')
    useGame.getState().updatePlayer([-6.15, 0, 3.7])
    useGame.getState().interact()
    expect(useGame.getState().mode).toBe('explore')
    fill('finish')
    useGame.getState().interact()
    expect(useGame.getState().mode).toBe('tour')
  })

  it('gives the blocks back when a mission is restarted', () => {
    fill('orchestra')
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
