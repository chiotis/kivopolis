import { beforeEach, describe, expect, it } from 'vitest'
import { BUILDING_ORDER, buildingHere, buildingStatus, readBuildings, signNear, signposts, SIGN_RADIUS, unlocked, type ProgressView } from '../src/game/buildings'
import { ROADS, ROAD_WIDTH, nearest, roadDistance } from '../src/game/regions'
import { interactionAvailable, useGame, useShared } from '../src/game/store'
import { VoxelWorld, S, bx, bz } from '../src/voxel/world'
import { Block } from '../src/voxel/blocks'
import { planOf, stepTotals, usePlans } from '../src/game/plans'

const progress = (patch: Partial<ProgressView> = {}): ProgressView => ({ discovered: false, completed: false, celebrated: [], buildings: {}, ...patch })

describe('buildings open one at a time', () => {
  it('opens each building once the one before it is finished', () => {
    expect(BUILDING_ORDER).toEqual(['theatre', 'sanctuary', 'agora', 'stadium'])
    const start = progress()
    expect(unlocked(start, 'theatre')).toBe(true)
    expect(buildingStatus(start, 'sanctuary')).toBe('locked')
    // Finishing the theatre opens the sanctuary, whose plan exists since Phase 13.
    const theatreDone = progress({ discovered: true, completed: true })
    expect(buildingStatus(theatreDone, 'theatre')).toBe('done')
    expect(buildingStatus(theatreDone, 'sanctuary')).toBe('open')
    expect(buildingStatus(theatreDone, 'agora')).toBe('locked')
    const sanctuaryDone = progress({ completed: true, buildings: { sanctuary: { discovered: true, completed: true, celebrated: [] } } })
    expect(buildingStatus(sanctuaryDone, 'agora')).toBe('open')
    expect(buildingStatus(sanctuaryDone, 'stadium')).toBe('locked')
  })

  it('reads saved building progress and drops anything unknown', () => {
    expect(readBuildings({ sanctuary: { discovered: true, celebrated: ['x', 3] }, theatre: { completed: true }, temple: {} }))
      .toEqual({ sanctuary: { discovered: true, completed: false, celebrated: ['x'] } })
    expect(readBuildings('nonsense')).toEqual({})
  })
})

describe('signposts', () => {
  const world = new VoxelWorld()

  it('stand beside the road at each new area, within reach of it', () => {
    expect(signposts.map(({ id }) => id)).toEqual(['sanctuary', 'agora', 'stadium'])
    for (const { id, x, z } of signposts) {
      expect(roadDistance(x, z), id).toBeGreaterThan(ROAD_WIDTH + 0.2)
      expect(Math.min(...ROADS.map((line) => nearest(line, x, z).distance)), id).toBeLessThan(SIGN_RADIUS - 0.4)
      // The sign stands on open ground, not on a boundary stone.
      const top = Math.round(world.surface(x, z) / S) + 15
      expect(world.get(bx(x), top + 1, bz(z)), id).toBe(Block.air)
      expect(signNear(x + 1, z), id).toBe(id)
      expect(buildingHere(x, z) === id || roadDistance(x, z) < 3, id).toBe(true)
    }
  })
})

describe('reading a signpost', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().start()
  })

  it('shows a locked building without marking it found', () => {
    const [sign] = signposts
    useGame.getState().updatePlayer([sign.x + 1, 0, sign.z])
    expect(interactionAvailable(useGame.getState())).toBe(true)
    useGame.getState().interact()
    expect(useGame.getState()).toMatchObject({ panel: 'building', building: 'sanctuary' })
    expect(useShared.getState().buildings.sanctuary).toBeUndefined()
  })

  it('marks an open building as found and keeps it in the saved game', () => {
    useShared.setState({ discovered: true, completed: true })
    const [sign] = signposts
    useGame.getState().updatePlayer([sign.x + 1, 0, sign.z])
    useGame.getState().interact()
    expect(useShared.getState().buildings.sanctuary).toEqual({ discovered: true, completed: false, celebrated: [] })
  })
})

describe('the end of the game', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().start()
  })

  it('runs down the stadium\'s track when its last step stands, then shows the finished city', () => {
    const plan = planOf('stadium')!
    useShared.setState({ discovered: true, completed: true, buildings: {
      sanctuary: { discovered: true, completed: true, celebrated: [] },
      agora: { discovered: true, completed: true, celebrated: [] },
      stadium: { discovered: true, completed: false, celebrated: [] },
    } })
    usePlans.setState({ sites: { stadium: { counts: stepTotals(plan), wrong: [], missing: [] } } })
    expect(useShared.getState().buildings.stadium?.completed).toBe(true)
    expect(useGame.getState()).toMatchObject({ mode: 'tour', tour: 'stadium', panel: null })
    useGame.getState().endTour()
    expect(useGame.getState()).toMatchObject({ mode: 'explore', panel: 'finale' })
    expect(buildingStatus(useShared.getState(), 'stadium')).toBe('done')
  })

  it('still ends the theatre\'s tour with its own result window', () => {
    useGame.setState({ mode: 'tour', tour: 'theatre' })
    useGame.getState().endTour()
    expect(useGame.getState()).toMatchObject({ mode: 'explore', panel: 'complete' })
    expect(useShared.getState().completed).toBe(true)
  })
})
