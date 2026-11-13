import { blockSound } from '../game/audio'
import { inventory } from '../game/inventory'
import { useGame } from '../game/store'
import { getWorld } from '../voxel/world'
import { spawnAnimals, startle, type Animal } from './wildlife'
import { spawnDrop } from './dropState'
import { playerState } from './player'

/** The island's animals; they are not saved and wander back to their meadows on each visit. */
export const herd: { list: Animal[] } = { list: [] }

export function ensureHerd() {
  if (!herd.list.length) herd.list = spawnAnimals(getWorld())
  return herd.list
}

/** Left click: sheep give wool (once until it grows back), chickens a feather; every animal runs off. */
export function strikeAnimal(animal: Animal) {
  const state = useGame.getState()
  const { x, z } = playerState.body.position
  startle(animal, x, z)
  state.learn(animal.kind)
  if (state.settings.sound) blockSound('soft', 'hit')
  const top = animal.y + 0.6
  if (animal.kind === 'sheep' && animal.sheared <= 0) {
    animal.sheared = 120
    spawnDrop({ item: 'wool', count: 1 + Math.round(Math.random()) }, animal.x, top, animal.z, [0, 2.4, 0], 0.4)
  } else if (animal.kind === 'chicken' && animal.cooldown <= 0) {
    animal.cooldown = 10
    spawnDrop({ item: 'feather', count: 1 }, animal.x, top, animal.z, [0, 2, 0], 0.4)
  }
}

/** Right click: a goat gives milk straight into the inventory every half minute. */
export function tendAnimal(animal: Animal) {
  const state = useGame.getState()
  state.learn(animal.kind)
  animal.walking = false
  animal.timer = 2
  if (animal.kind !== 'goat') return
  if (animal.cooldown > 0) return
  animal.cooldown = 30
  const left = inventory.add({ item: 'milk', count: 1 })
  if (left) spawnDrop({ item: 'milk', count: left }, animal.x, animal.y + 0.6, animal.z)
  if (state.settings.sound) blockSound('soft', 'place')
}
