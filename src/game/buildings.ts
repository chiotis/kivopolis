import { AREAS, areaAt, type BuildingId } from './regions'

/**
 * The buildings of the island, in the order they open: each one's signpost opens once the
 * building before it is finished. The theatre keeps its own progress fields (discovered,
 * celebrated, completed) in the saved game; the others keep the same three in `buildings`.
 */
export const BUILDING_ORDER: readonly BuildingId[] = ['theatre', 'sanctuary', 'agora', 'stadium']

export interface SiteProgress {
  discovered: boolean
  completed: boolean
  /** Steps already congratulated. */
  celebrated: string[]
}
export type BuildingProgress = Partial<Record<Exclude<BuildingId, 'theatre'>, SiteProgress>>

/** The parts of the saved game this module reads. */
export interface ProgressView {
  discovered: boolean
  completed: boolean
  celebrated: readonly string[]
  buildings: BuildingProgress
}

const empty = (): SiteProgress => ({ discovered: false, completed: false, celebrated: [] })

export function siteProgress(progress: ProgressView, id: BuildingId): SiteProgress {
  if (id === 'theatre') return { discovered: progress.discovered, completed: progress.completed, celebrated: [...progress.celebrated] }
  return progress.buildings[id] ?? empty()
}

/** The building that has to be finished before this one opens. */
export const previousBuilding = (id: BuildingId) => BUILDING_ORDER[Math.max(0, BUILDING_ORDER.indexOf(id) - 1)]

/** Open once the building before it in the order is finished. */
export function unlocked(progress: ProgressView, id: BuildingId) {
  const i = BUILDING_ORDER.indexOf(id)
  return i <= 0 || siteProgress(progress, BUILDING_ORDER[i - 1]).completed
}

/** Buildings whose block plan and steps exist. The others arrive in Phases 13–15. */
export const hasPlan = (id: BuildingId) => id === 'theatre'

export type BuildingStatus = 'locked' | 'coming' | 'open' | 'done'
export function buildingStatus(progress: ProgressView, id: BuildingId): BuildingStatus {
  if (!unlocked(progress, id)) return 'locked'
  if (!hasPlan(id)) return 'coming'
  return siteProgress(progress, id).completed ? 'done' : 'open'
}

/** How close the player must stand to read a signpost. */
export const SIGN_RADIUS = 2.55

/** The new areas' signposts (the theatre has its own site sign and tour point). */
export const signposts = AREAS.filter((item) => item.id !== 'theatre').map((item) => ({ id: item.id, x: item.sign[0], z: item.sign[1] }))

/** The building whose signpost the player stands by, if any. */
export function signNear(x: number, z: number) {
  return signposts.find((sign) => Math.hypot(sign.x - x, sign.z - z) <= SIGN_RADIUS)?.id ?? null
}

/** The building area the player stands in, if any. */
export const buildingHere = (x: number, z: number): BuildingId | null => areaAt(x, z)?.id ?? null

/** Reads saved per-building progress, dropping anything unknown. */
export function readBuildings(value: unknown): BuildingProgress {
  const result: BuildingProgress = {}
  if (!value || typeof value !== 'object') return result
  for (const id of BUILDING_ORDER) {
    if (id === 'theatre') continue
    const item = (value as Record<string, unknown>)[id] as Partial<SiteProgress> | undefined
    if (!item || typeof item !== 'object') continue
    result[id] = {
      discovered: item.discovered === true,
      completed: item.completed === true,
      celebrated: Array.isArray(item.celebrated) ? item.celebrated.filter((step): step is string => typeof step === 'string') : [],
    }
  }
  return result
}
