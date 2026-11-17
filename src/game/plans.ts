import { create } from 'zustand'
import { isEmpty } from '../voxel/blocks'
import type { BuildingId } from './regions'
import { FLOOR as SANCTUARY_FLOOR, SANCTUARY_STEPS, WALL, sanctuaryCells, sanctuaryCore } from './blueprints/sanctuary'
import { AGORA_STEPS, GROUND as AGORA_GROUND, agoraCells } from './blueprints/agora'
import { STADIUM_STEPS, GROUND as STADIUM_GROUND, stadiumCells } from './blueprints/stadium'
import { cells as theatreCells } from './blueprints/theatre'

/**
 * The block plans of the buildings after the theatre (Phase 13 on). The theatre keeps its own
 * missions (theatre.ts, site.ts); every later building is a list of steps and the cells each step
 * fills, counted from the world the same way.
 */
export interface PlanCell {
  x: number
  y: number
  z: number
  /** The block the ghost guide shows. */
  block: number
  /** Blocks that complete the cell (the shown block first). */
  accept: number[]
  step: string
  /** The lowest course of a structure: the generator gives it solid ground underneath. */
  footing?: boolean
  /** Laid in the ground (the agora's pipe): the generator clears everything above it. */
  open?: boolean
}
export interface PlanStep { id: string; reward: number }
/** A rectangle the generator levels to grass at `top`, clearing what stands above it. */
export interface PlanGround { x0: number; x1: number; z0: number; z1: number; top: number }
export interface Plan {
  id: Exclude<BuildingId, 'theatre'>
  steps: readonly PlanStep[]
  cells: readonly PlanCell[]
  ground: PlanGround
  /** Earth heaped up when the game starts, for a structure to be built round (the temple's krepis). */
  core?: readonly (readonly [number, number, number])[]
}

export const plans: readonly Plan[] = [
  {
    id: 'sanctuary', steps: SANCTUARY_STEPS, cells: sanctuaryCells, core: sanctuaryCore,
    ground: { x0: WALL.x0 - 1, x1: WALL.x1 + 1, z0: WALL.z0 - 1, z1: WALL.z1 + 1, top: SANCTUARY_FLOOR - 1 },
  },
  { id: 'agora', steps: AGORA_STEPS, cells: agoraCells, ground: AGORA_GROUND },
  { id: 'stadium', steps: STADIUM_STEPS, cells: stadiumCells, ground: STADIUM_GROUND },
]
export const planOf = (id: BuildingId) => plans.find((plan) => plan.id === id) ?? null
/** Every step of every plan, so a step id alone says which building it belongs to. */
export const planSteps = new Map(plans.flatMap((plan) => plan.steps.map((step) => [step.id, plan] as const)))

type Placed = Pick<PlanCell, 'x' | 'y' | 'z' | 'accept'>
const byStep = new Map<string, Placed[]>()
for (const cell of theatreCells) byStep.set(cell.mission, [...(byStep.get(cell.mission) ?? []), cell])
for (const plan of plans) for (const cell of plan.cells) byStep.set(cell.step, [...(byStep.get(cell.step) ?? []), cell])
/**
 * The cells of any step by its id: a theatre mission or a later building's step (the ids never
 * repeat). Restarting a step takes these down, in the game and in a room.
 */
export const cellsOfStep = (id: string): readonly Placed[] => byStep.get(id) ?? []
export const isStep = (id: unknown): id is string => typeof id === 'string' && byStep.has(id)

/** How many cells each step has; a step without cells is still to come in a later version. */
export const stepTotals = (plan: Plan) => {
  const totals: Record<string, number> = Object.fromEntries(plan.steps.map(({ id }) => [id, 0]))
  for (const cell of plan.cells) totals[cell.step]++
  return totals
}
const totalsOf = new Map(plans.map((plan) => [plan.id, stepTotals(plan)]))
export const stepTotal = (plan: Plan, step: string) => totalsOf.get(plan.id)?.[step] ?? 0
export const stepReady = (plan: Plan, step: string) => stepTotal(plan, step) > 0

export interface PlanSite {
  /** Correctly built cells per step. */
  counts: Record<string, number>
  /** Indices into the plan's cells that hold a block it does not accept there. */
  wrong: number[]
  /** Indices into the plan's cells still waiting for their block. */
  missing: number[]
}

export function measurePlan(world: { get(x: number, y: number, z: number): number }, plan: Plan): PlanSite {
  const counts: Record<string, number> = Object.fromEntries(plan.steps.map(({ id }) => [id, 0]))
  const wrong: number[] = []
  const missing: number[] = []
  plan.cells.forEach((cell, i) => {
    const id = world.get(cell.x, cell.y, cell.z)
    if (cell.accept.includes(id)) counts[cell.step]++
    else if (isEmpty(id)) missing.push(i)
    else wrong.push(i)
  })
  return { counts, wrong, missing }
}

export const stepComplete = (plan: Plan, step: string, counts: Record<string, number>) =>
  stepReady(plan, step) && (counts[step] ?? 0) >= stepTotal(plan, step)

/** The step being built: the first one not finished, in order. Null when every step is done. */
export function activeStep(plan: Plan, counts: Record<string, number>) {
  return plan.steps.find(({ id }) => !stepComplete(plan, id, counts))?.id ?? null
}

/** Steps finished in order from the first, which is how a building advances. */
export function finishedSteps(plan: Plan, counts: Record<string, number>) {
  const done: string[] = []
  for (const { id } of plan.steps) {
    if (!stepComplete(plan, id, counts)) break
    done.push(id)
  }
  return done
}

/** Every block a step uses, grouped by the block the plan shows, as for the theatre's missions. */
export function stepMaterials(plan: Plan, step: string, site: PlanSite) {
  const open = new Set([...site.missing, ...site.wrong])
  const result = new Map<number, { block: number; placed: number; total: number }>()
  plan.cells.forEach((cell, i) => {
    if (cell.step !== step) return
    const entry = result.get(cell.block) ?? { block: cell.block, placed: 0, total: 0 }
    entry.total++
    if (!open.has(i)) entry.placed++
    result.set(cell.block, entry)
  })
  return [...result.values()].sort((a, b) => b.total - a.total)
}

export const stepPoints = (plan: Plan, celebrated: readonly string[]) =>
  plan.steps.reduce((sum, step) => sum + (celebrated.includes(step.id) ? step.reward : 0), 0)

type Sites = Partial<Record<Plan['id'], PlanSite>>
export const usePlans = create<{ sites: Sites; version: number }>(() => ({ sites: {}, version: 0 }))

let bound: object | null = null
/** Keeps `usePlans` in step with the world, like trackSite does for the theatre. */
export function trackPlans(world: { get(x: number, y: number, z: number): number; subscribe(listener: () => void): unknown }) {
  if (bound === world) return
  bound = world
  const refresh = () => usePlans.setState((state) => ({
    sites: Object.fromEntries(plans.map((plan) => [plan.id, measurePlan(world, plan)])),
    version: state.version + 1,
  }))
  world.subscribe(refresh)
  refresh()
}
