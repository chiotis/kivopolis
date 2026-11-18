import { beforeEach, describe, expect, it } from 'vitest'
import { useGame, useShared } from '../src/game/store'
import { MAX_HEALTH, REGEN_DELAY, REGEN_EVERY, SAFE_FALL, fallDamage, hurt, modeOf, readHealth, tickSurvival, useSurvival } from '../src/game/survival'
import { PLAYER } from '../src/voxel/physics'
import { S } from '../src/voxel/grid'
import { readRecord } from '../src/game/save'

/** A fall of this many blocks, in world units. */
const blocksDown = (blocks: number) => blocks * S

describe('choosing survival', () => {
  beforeEach(() => useGame.getState().reset())

  it('is a third way to play beside gathering and creative', () => {
    const { setMode } = useGame.getState()
    setMode('survival')
    expect(useShared.getState()).toMatchObject({ survival: true, creative: false })
    expect(modeOf(useShared.getState())).toBe('survival')
    setMode('creative')
    expect(modeOf(useShared.getState())).toBe('creative')
    setMode('gather')
    expect(useShared.getState()).toMatchObject({ survival: false, creative: false })
  })
})

describe('falling', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().setMode('survival')
  })

  it('does not hurt a jump, a step or a short drop, and hurts a block for every block beyond', () => {
    // A full jump clears two blocks.
    expect(fallDamage(PLAYER.jump ** 2 / (2 * PLAYER.gravity))).toBe(0)
    expect(fallDamage(blocksDown(SAFE_FALL))).toBe(0)
    expect(fallDamage(blocksDown(SAFE_FALL + 1))).toBe(1)
    expect(fallDamage(blocksDown(10))).toBe(10 - SAFE_FALL)
    expect(fallDamage(blocksDown(SAFE_FALL + MAX_HEALTH))).toBe(MAX_HEALTH)
  })

  it('takes health only in survival play, and not while creative is on', () => {
    expect(hurt(3)).toBe(false)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 3)
    useGame.getState().setCreative(true)
    hurt(5)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 3)
    useGame.getState().setMode('gather')
    hurt(5)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 3)
  })

  it('faints when health runs out, and wakes with full health', () => {
    expect(hurt(MAX_HEALTH + 4)).toBe(true)
    expect(useSurvival.getState().health).toBe(0)
    useGame.getState().reset()
    expect(useSurvival.getState().health).toBe(MAX_HEALTH)
  })
})

describe('healing', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().setMode('survival')
  })

  it('comes back a point at a time after a quiet spell', () => {
    hurt(4)
    tickSurvival(REGEN_DELAY - 0.1)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 4)
    tickSurvival(0.1)
    for (let t = 0; t < REGEN_EVERY + 0.01; t += 0.05) tickSurvival(0.05)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 3)
    // Another fall starts the wait again.
    hurt(1)
    tickSurvival(REGEN_EVERY + 0.5)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 4)
  })

  it('keeps health in the saved game, never below one point', () => {
    hurt(6)
    const saved = readRecord<{ player: { health: number } }>('game')!
    expect(saved.player.health).toBe(MAX_HEALTH - 6)
    expect(readHealth(0)).toBe(1)
    expect(readHealth('lots')).toBe(MAX_HEALTH)
    expect(readHealth(99)).toBe(MAX_HEALTH)
  })
})
