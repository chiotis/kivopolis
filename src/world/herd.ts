import { blockSound } from '../game/audio'
import { inventory } from '../game/inventory'
import { useGame } from '../game/store'
import { getWorld } from '../voxel/world'
import { spawnAnimals, stepAnimals, strikeGives, tendGives, type Animal } from './wildlife'
import { spawnDrop } from './dropState'
import { playerState } from './player'

/** Where the room last said an animal was (Phase 12): [id, x, y, z, yaw, walking, sheared, hurt]. */
export type AnimalPose = [number, number, number, number, number, number, number, number]

/**
 * The island's animals; they are not saved and wander back to their meadows on each visit. In a
 * room (Phase 12) the room server runs them and `remote` is set: this game only follows where the
 * room says they are, and sends what the player does to them.
 */
export const herd: {
  list: Animal[]
  remote: boolean
  goals: Map<number, AnimalPose>
  send: ((animal: number, act: 'strike' | 'tend') => void) | null
} = { list: [], remote: false, goals: new Map(), send: null }

export function ensureHerd() {
  if (!herd.list.length && !herd.remote) herd.list = spawnAnimals(getWorld())
  return herd.list
}

/** The room's animals replace this game's, keeping the objects already drawn. */
export function setHerd(list: Animal[]) {
  const mine = new Map(herd.list.map((animal) => [animal.id, animal]))
  herd.list = list.map((animal) => Object.assign(mine.get(animal.id) ?? {}, animal))
  herd.goals.clear()
  herd.remote = true
}

/** One step of the herd: every animal wanders, grazes or rests, and chickens now and then drop a feather. */
export function stepHerd(dt: number, night: boolean) {
  if (herd.remote) { followHerd(dt); return }
  stepAnimals(ensureHerd(), dt, { world: getWorld(), night }, (x, y, z) => spawnDrop({ item: 'feather', count: 1 }, x, y, z))
}

/** In a room: glide each animal towards where the room last said it was (sent five times a second). */
function followHerd(dt: number) {
  const follow = 1 - Math.exp(-dt * 8)
  for (const animal of herd.list) {
    const goal = herd.goals.get(animal.id)
    if (!goal) continue
    const [, x, y, z, yaw, walking, sheared, hurt] = goal
    const dx = (x - animal.x) * follow, dz = (z - animal.z) * follow
    animal.x += dx
    animal.z += dz
    animal.y += (y - animal.y) * follow
    animal.yaw += Math.atan2(Math.sin(yaw - animal.yaw), Math.cos(yaw - animal.yaw)) * follow
    animal.walking = walking > 0
    animal.stride += Math.hypot(dx, dz) * 9
    if (!animal.walking) animal.stride *= 1 - Math.min(1, dt * 8)
    animal.sheared = sheared
    // A new hit starts the hop again; otherwise it runs down here.
    animal.hurt = hurt > animal.hurt + 0.1 ? hurt : Math.max(0, animal.hurt - dt)
    goal[7] = Math.max(0, hurt - dt)
  }
}

/** Left click: sheep give wool (once until it grows back), chickens a feather; every animal runs off. */
export function strikeAnimal(animal: Animal) {
  const state = useGame.getState()
  state.learn(animal.kind)
  if (state.settings.sound) blockSound('soft', 'hit')
  if (herd.send) { herd.send(animal.id, 'strike'); return }
  const { x, z } = playerState.body.position
  const gives = strikeGives(animal, x, z)
  if (gives) spawnDrop(gives, animal.x, animal.y + 0.6, animal.z, [0, gives.item === 'wool' ? 2.4 : 2, 0], 0.4)
}

/** Right click: a goat gives milk straight into the inventory every half minute. */
export function tendAnimal(animal: Animal) {
  const state = useGame.getState()
  state.learn(animal.kind)
  if (herd.send) { herd.send(animal.id, 'tend'); return }
  const milk = tendGives(animal)
  if (!milk) return
  const left = inventory.add(milk)
  if (left) spawnDrop({ ...milk, count: left }, animal.x, animal.y + 0.6, animal.z)
  if (state.settings.sound) blockSound('soft', 'place')
}
