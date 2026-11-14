import { beforeEach, describe, expect, it } from 'vitest'
import { inventory, insert, resetInventory, useInventory } from '../src/game/inventory'
import { itemByKey, mining, rollDrop, type Stack } from '../src/game/items'
import { matchRecipe, recipes } from '../src/game/recipes'
import { blockByKey } from '../src/voxel/blocks'

const s = (item: string, count = 1): Stack => ({ item, count })
const block = (key: string) => blockByKey.get(key)!

describe('recipes', () => {
  it('only references items that exist', () => {
    for (const recipe of recipes) {
      expect(itemByKey.has(recipe.result.item)).toBe(true)
      for (const ingredient of [...Object.values(recipe.keys ?? {}), ...(recipe.ingredients ?? [])]) expect(itemByKey.has(ingredient)).toBe(true)
    }
  })

  it('matches shaped recipes anywhere in the grid and mirrored', () => {
    // Sticks in the right column of a 2 × 2 grid.
    expect(matchRecipe([null, s('planks'), null, s('planks')], 2)?.result).toEqual(s('stick', 4))
    // An axe and its mirror image.
    const axe = [s('limestone'), s('limestone'), null, s('limestone'), s('stick'), null, null, s('stick'), null]
    const mirrored = [null, s('limestone'), s('limestone'), null, s('stick'), s('limestone'), null, s('stick'), null]
    expect(matchRecipe(axe, 3)?.result.item).toBe('stoneAxe')
    expect(matchRecipe(mirrored, 3)?.result.item).toBe('stoneAxe')
    expect(matchRecipe([s('planks'), null, null, null], 2)).toBeNull()
  })

  it('matches shapeless recipes in any order and needs a workshop for 3 × 3 shapes', () => {
    expect(matchRecipe([s('tinIngot'), s('copperIngot'), s('copperIngot'), s('copperIngot')], 2)?.result).toEqual(s('bronzeIngot', 4))
    const kiln = ['limestone', 'limestone', 'limestone', 'limestone', null, 'limestone', 'limestone', 'limestone', 'limestone']
    expect(matchRecipe(kiln.map((item) => (item ? s(item) : null)), 3)?.result.item).toBe('kiln')
    // One limestone crushes into gravel; four in a square still make ashlar.
    expect(matchRecipe([null, null, null, s('limestone')], 2)?.result).toEqual(s('gravel', 2))
    expect(matchRecipe([s('limestone'), s('limestone'), s('limestone'), s('limestone')], 2)?.result).toEqual(s('ashlar', 4))
    expect(matchRecipe([s('limestone'), s('limestone'), null, null], 2)).toBeNull()
  })
})

describe('mining', () => {
  it('needs the right tool tier for a drop and speeds up with better tools', () => {
    expect(mining(block('limestone'), null)).toMatchObject({ harvest: false })
    expect(mining(block('limestone'), s('woodPickaxe')).harvest).toBe(true)
    expect(mining(block('marble'), s('woodPickaxe')).harvest).toBe(false)
    expect(mining(block('marble'), s('stonePickaxe')).harvest).toBe(true)
    expect(mining(block('oliveLog'), null).harvest).toBe(true)
    expect(mining(block('oliveLog'), s('stoneAxe')).time).toBeLessThan(mining(block('oliveLog'), s('woodAxe')).time)
    expect(mining(block('oliveLog'), s('woodPickaxe')).time).toBe(mining(block('oliveLog'), null).time)
  })

  it('turns grass into soil, clay into lumps, and leaves sometimes into sticks', () => {
    expect(rollDrop(block('grass'))).toEqual(s('soil'))
    expect(rollDrop(block('clay'))).toEqual(s('clayLump', 4))
    expect(rollDrop(block('oliveLeaves'), () => 0.9)).toBeNull()
    expect(rollDrop(block('oliveLeaves'), () => 0.01)).toEqual(s('stick'))
    expect(rollDrop(block('bedrock'))).toBeNull()
  })
})

describe('inventory', () => {
  beforeEach(() => resetInventory())

  it('merges stacks up to 64 and keeps tools unstacked', () => {
    const slots: (Stack | null)[] = [s('limestone', 60), null, null]
    expect(insert(slots, s('limestone', 10), [0, 1, 2])).toBe(0)
    expect(slots.map((slot) => slot?.count ?? 0)).toEqual([64, 6, 0])
    expect(inventory.add(s('woodPickaxe'))).toBe(0)
    expect(inventory.add(s('woodPickaxe'))).toBe(0)
    expect(useInventory.getState().slots.filter((slot) => slot?.item === 'woodPickaxe')).toHaveLength(2)
  })

  it('picks up, splits, places one, swaps and shift-moves like a sandbox inventory', () => {
    inventory.add(s('limestone', 10))
    inventory.click({ area: 'inv', index: 0 }, 'right', false)
    expect(useInventory.getState().cursor).toEqual(s('limestone', 5))
    inventory.click({ area: 'inv', index: 4 }, 'right', false)
    expect(useInventory.getState().slots[4]).toEqual(s('limestone', 1))
    inventory.click({ area: 'inv', index: 0 }, 'left', false)
    expect(useInventory.getState().slots[0]).toEqual(s('limestone', 9))
    expect(useInventory.getState().cursor).toBeNull()
    inventory.click({ area: 'inv', index: 0 }, 'left', true)
    const { slots } = useInventory.getState()
    expect(slots[0]).toBeNull()
    expect(slots[9]).toEqual(s('limestone', 9))
  })

  it('crafts from the grid, consumes ingredients and returns leftovers on close', () => {
    inventory.open(2)
    useInventory.setState({ craft: [s('oliveLog', 2), null, null, null, null, null, null, null, null] })
    inventory.craft(false)
    expect(useInventory.getState().cursor).toEqual(s('planks', 4))
    expect(useInventory.getState().craft[0]).toEqual(s('oliveLog', 1))
    const spill = inventory.close()
    expect(spill).toEqual([])
    const items = useInventory.getState().slots.filter(Boolean)
    expect(items).toEqual(expect.arrayContaining([s('planks', 4), s('oliveLog', 1)]))
  })

  it('wears tools out', () => {
    inventory.add(s('woodShovel'))
    for (let i = 0; i < 59; i++) expect(inventory.wear(0)).toBe(false)
    expect(inventory.wear(0)).toBe(true)
    expect(useInventory.getState().slots[0]).toBeNull()
  })

  it('smelts in a kiln while it has fuel and room', () => {
    inventory.open(2, '42')
    useInventory.setState((state) => ({ kilns: { ...state.kilns, 42: { ...state.kilns[42], input: s('copperOre', 3), fuel: s('stick', 1) } } }))
    for (let t = 0; t < 40; t++) inventory.tick(0.2)
    const kiln = useInventory.getState().kilns[42]
    // One stick burns 2.5 s: not enough for a 4 s smelt, so the progress cools down again.
    expect(kiln.output).toBeNull()
    useInventory.setState((state) => ({ kilns: { ...state.kilns, 42: { ...state.kilns[42], fuel: s('oliveLog', 1) } } }))
    for (let t = 0; t < 70; t++) inventory.tick(0.2)
    expect(useInventory.getState().kilns[42].output).toEqual(s('copperIngot', 3))
    expect(useInventory.getState().kilns[42].input).toBeNull()
    expect(inventory.removeKiln('42')).toEqual([s('copperIngot', 3)])
  })
})
