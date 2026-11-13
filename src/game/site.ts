import { create } from 'zustand'
import { isEmpty } from '../voxel/blocks'
import type { VoxelWorld } from '../voxel/world'
import { cells, cellTotals, type Cell } from './blueprints/theatre'
import { objectives, type Mission } from './theatre'

export type Counts = Record<Mission, number>

interface SiteState {
  /** Correctly built cells per mission. */
  counts: Counts
  /** Indices into `cells` that hold a block the blueprint does not accept there. */
  wrong: number[]
  /** Indices into `cells` still waiting for their block. */
  missing: number[]
  /** Bumped on every measurement so renderers can rebuild cheaply. */
  version: number
}

const empty = (): Counts => ({ discover: 0, orchestra: 0, seats: 0, koilon: 0, stairs: 0, skene: 0, finish: 0 })

export const useSite = create<SiteState>(() => ({ counts: empty(), wrong: [], missing: cells.map((_, i) => i), version: 0 }))

export const builtIn = (world: Pick<VoxelWorld, 'get'>, cell: Cell) => cell.accept.includes(world.get(cell.x, cell.y, cell.z))

export function measure(world: Pick<VoxelWorld, 'get'>) {
  const counts = empty()
  const wrong: number[] = []
  const missing: number[] = []
  cells.forEach((cell, i) => {
    const id = world.get(cell.x, cell.y, cell.z)
    if (cell.accept.includes(id)) counts[cell.mission]++
    else if (isEmpty(id)) missing.push(i)
    else wrong.push(i)
  })
  return { counts, wrong, missing }
}

let bound: VoxelWorld | null = null

/** Keeps `useSite` in step with the world. Safe to call repeatedly. */
export function trackSite(world: VoxelWorld) {
  if (bound === world) return
  bound = world
  const refresh = () => useSite.setState((state) => ({ ...measure(world), version: state.version + 1 }))
  world.subscribe(refresh)
  refresh()
}

export function missionCounts(mission: Mission, counts: Counts) {
  return { done: counts[mission], total: cellTotals[mission] }
}

export const complete = (mission: Mission, counts: Counts) => counts[mission] >= cellTotals[mission]

export function activeMission(discovered: boolean, counts: Counts): Mission {
  if (!discovered) return 'discover'
  return objectives.find(({ id }) => id !== 'discover' && !complete(id, counts))?.id ?? 'finish'
}

export const entrancesReady = (counts: Counts) => complete('finish', counts)

export function earnedPoints(discovered: boolean, counts: Counts, completed: boolean) {
  if (!discovered) return 0
  return objectives.reduce((points, objective) => {
    const finished = objective.id === 'finish' ? completed : objective.id === 'discover' || complete(objective.id, counts)
    return points + (finished ? objective.reward : 0)
  }, 0)
}

export const totalCells = cells.length
export const builtTotal = (counts: Counts) => Object.values(counts).reduce((sum, value) => sum + value, 0)

/** Blocks still needed for a mission, grouped by the block the blueprint shows. */
export function needs(mission: Mission, missing: readonly number[], wrong: readonly number[]) {
  const result = new Map<number, number>()
  for (const i of [...missing, ...wrong]) {
    const cell = cells[i]
    if (cell.mission === mission) result.set(cell.block, (result.get(cell.block) ?? 0) + 1)
  }
  return [...result].sort((a, b) => b[1] - a[1])
}
