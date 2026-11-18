import { beforeEach, describe, expect, it } from 'vitest'
import { useGame, useShared } from '../src/game/store'
import { FED, HUNGER_EVERY, MAX_FOOD, MAX_HEALTH, REGEN_DELAY, REGEN_EVERY, SAFE_FALL, STARVE_EVERY, eat, fallDamage, freshSurvival, hurt, modeOf, readBed, readFood, readHealth, setBed, tickSurvival, useSurvival, wake } from '../src/game/survival'
import { food, smelting, type Stack } from '../src/game/items'
import { matchRecipe } from '../src/game/recipes'
import { VoxelWorld, SX, SY, SZ } from '../src/voxel/world'
import { Block } from '../src/voxel/blocks'
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

/** Runs survival for this many seconds in small frames. */
function run(seconds: number, effort = 1) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) tickSurvival(0.05, effort)
}

describe('hunger', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().setMode('survival')
  })

  it('falls a point every half minute, twice as fast when sprinting', () => {
    run(HUNGER_EVERY + 0.1)
    expect(useSurvival.getState().food).toBe(MAX_FOOD - 1)
    run(HUNGER_EVERY + 0.1, 2)
    expect(useSurvival.getState().food).toBe(MAX_FOOD - 3)
  })

  it('heals only a fed player', () => {
    hurt(4)
    useSurvival.setState({ food: FED })
    run(REGEN_DELAY + REGEN_EVERY * 2)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 4)
    useSurvival.setState({ food: FED + 2 })
    run(REGEN_EVERY + 0.1)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 3)
  })

  it('wears an empty stomach down to the last point of health, never past it', () => {
    useSurvival.setState({ food: 0, appetite: 0 })
    run(STARVE_EVERY + 0.1)
    expect(useSurvival.getState().health).toBe(MAX_HEALTH - 1)
    run(STARVE_EVERY * (MAX_HEALTH + 5))
    expect(useSurvival.getState().health).toBe(1)
  })

  it('is filled by eating, until the player is full', () => {
    useSurvival.setState({ food: 10 })
    expect(eat(food.bread)).toBe('ate')
    expect(useSurvival.getState().food).toBe(16)
    expect(eat(food.milk)).toBe('ate')
    expect(useSurvival.getState().food).toBe(MAX_FOOD)
    expect(eat(food.olive)).toBe('full')
    expect(eat(food.stick)).toBeNull()
    useGame.getState().setMode('gather')
    useSurvival.setState({ food: 10 })
    expect(eat(food.fig)).toBeNull()
  })

  it('stays in the save, and a faint leaves the player some food', () => {
    useSurvival.setState({ food: 3 })
    const saved = readRecord<{ player: { food: number } }>('game')!
    expect(saved.player.food).toBe(3)
    expect(readFood(-2)).toBe(0)
    expect(readFood(undefined)).toBe(MAX_FOOD)
    wake()
    expect(useSurvival.getState()).toMatchObject({ health: MAX_HEALTH, food: FED + 1 })
  })
})

describe('food', () => {
  const s = (item: string, count = 1): Stack => ({ item, count })

  it('kneads three wheat into dough, which the kiln bakes into bread', () => {
    expect(matchRecipe([s('wheat'), s('wheat'), s('wheat'), null, null, null, null, null, null], 3)?.result).toEqual(s('dough'))
    expect(smelting.dough).toBe('bread')
    expect(Object.keys(food).sort()).toEqual(['bread', 'fig', 'milk', 'olive'])
  })

  it('grows on the island: fig trees in the groves and patches of wild wheat in the meadows', () => {
    const world = new VoxelWorld()
    let wheat = 0, figs = 0, floating = 0
    for (let y = 1; y < SY; y++) {
      for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SX; x++) {
          const id = world.get(x, y, z)
          if (id === Block.wheat) {
            wheat++
            if (world.get(x, y - 1, z) !== Block.grass) floating++
          } else if (id === Block.figLeaves) figs++
        }
      }
    }
    expect(wheat).toBeGreaterThan(300)
    expect(figs).toBeGreaterThan(200)
    expect(floating).toBe(0)
  })
})

describe('the κλίνη', () => {
  beforeEach(() => {
    useGame.getState().reset()
    useGame.getState().setMode('survival')
  })

  it('is made of a feather pillow, a woollen mattress and a wooden frame', () => {
    const s = (item: string): Stack => ({ item, count: 1 })
    expect(matchRecipe([s('feather'), s('wool'), s('wool'), s('planks'), s('planks'), s('planks'), null, null, null], 3)?.result).toEqual({ item: 'kline', count: 1 })
  })

  it('is where a player wakes, kept through a faint and in the save, and forgotten in a new game', () => {
    setBed([200, 20, 210])
    hurt(MAX_HEALTH)
    wake()
    expect(useSurvival.getState().bed).toEqual([200, 20, 210])
    expect(readRecord<{ player: { bed: number[] } }>('game')!.player.bed).toEqual([200, 20, 210])
    expect(readBed([1, 2])).toBeNull()
    expect(readBed([1.5, 2, 3])).toBeNull()
    freshSurvival()
    expect(useSurvival.getState().bed).toBeNull()
  })
})
