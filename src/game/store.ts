import { create } from 'zustand'
import { objectives, siteMarker, spawn, tourMarker, type Mission, type Point } from './theatre'
import { cells, legacySlots } from './blueprints/theatre'
import { activeMission, builtIn, complete, entrancesReady, trackSite, useSite } from './site'
import { placementSound } from './audio'
import { Block, blocks } from '../voxel/blocks'
import { getWorld, resetWorld } from '../voxel/world'
import { HOTBAR, inventory, resetInventory, useInventory } from './inventory'
import { clearDrops, spawnDrop } from '../world/dropState'
import { onSaveStatus, readRecord, saveAvailable, writeRecord } from './save'

export const interactionRadius = 2.55
/** Explore is the first-person game; overview is the orbiting architect's camera; tour is the finale. */
export type Mode = 'explore' | 'overview' | 'tour'
export type Panel = 'settings' | 'help' | 'journal' | 'pause' | 'reset' | 'new' | 'complete' | 'inventory' | 'workshop' | 'kiln'
export interface Settings { quality: 'auto' | 'high' | 'low'; sound: boolean; reducedMotion: boolean; dayCycle: boolean }
export interface Progress {
  started: boolean
  discovered: boolean
  player: Point
  completed: boolean
  /** Missions whose completion has already been celebrated, so rebuilding a broken block stays quiet. */
  celebrated: Mission[]
  /** Time of day, 0–1 (see game/daylight). */
  time: number
  /** Creative play: unlimited blocks, instant breaking and flight. */
  creative: boolean
  /** Short history notes already shown, so each pops up once. */
  facts: Fact[]
}
/** History notes that pop up the first time something happens in the world. */
export type Fact = 'night' | 'lamp' | 'sheep' | 'goat' | 'chicken'
export const factIds: readonly Fact[] = ['night', 'lamp', 'sheep', 'goat', 'chicken']
interface SavedGame { version: 2; progress: Progress; settings: Settings }
interface State {
  progress: Progress
  settings: Settings
  saveStatus: 'ready' | 'unavailable'
  screen: 'menu' | 'game'
  panel: Panel | null
  mode: Mode
  milestone: Mission | null
  /** Notes waiting to pop up in the top-right corner, oldest first. */
  facts: Fact[]
  /** Selected hotbar slot while exploring. */
  hotbar: number
  /** Short-lived message shown over the world, such as a refused block edit. */
  notice: string | null
  setHotbar: (index: number) => void
  setNotice: (notice: string | null) => void
  /** Opens the backpack (2 × 2 crafting), a workshop (3 × 3) or the kiln at a world cell. */
  openContainer: (kind: 'inventory' | 'workshop' | 'kiln', kiln?: string) => void
  start: () => void
  goHome: () => void
  setPanel: (panel: Panel | null) => void
  settingsChange: (settings: Partial<Settings>) => void
  toggleOverview: () => void
  updatePlayer: (position: Point) => void
  interact: () => void
  endTour: () => void
  restartMission: () => void
  reset: () => void
  dismissMilestone: () => void
  setTime: (time: number) => void
  setCreative: (creative: boolean) => void
  /** Queues a history note the first time it applies; later calls do nothing. */
  learn: (fact: Fact) => void
  dismissFact: () => void
}

/** True when the player stands by the site sign (before discovery) or the tour point (once the gates stand). */
export function interactionAvailable(state: Pick<State, 'progress' | 'panel' | 'mode'>) {
  const { progress } = state
  if (state.mode !== 'explore' || state.panel) return false
  if (progress.discovered && !entrancesReady(useSite.getState().counts)) return false
  const point = progress.discovered ? tourMarker : siteMarker
  return Math.hypot(progress.player[0] - point[0], progress.player[2] - point[2]) <= interactionRadius
}

const initialProgress = (): Progress => ({
  started: false, discovered: false, player: [...spawn], completed: false, celebrated: [],
  time: 0.3, creative: false, facts: [],
})
const defaults: Settings = { quality: 'auto', sound: false, reducedMotion: false, dayCycle: true }
const missionIds = new Set<string>(objectives.map(({ id }) => id))

interface Loaded { game: SavedGame; legacy: string[] }

function load(): Loaded {
  const fallback: Loaded = { game: { version: 2, progress: initialProgress(), settings: defaults }, legacy: [] }
  try {
    const data = readRecord<{ version?: number; progress?: Partial<Progress> & { placed?: unknown }; settings?: Partial<Settings> }>('game')
    if (!data) return fallback
    if ((data.version !== 1 && data.version !== 2) || !data.progress || !data.settings) return fallback
    const { progress, settings } = data
    // Saves from the prefab era list placed slot ids; they are rebuilt as blocks below.
    const legacy = data.version === 1 && Array.isArray(progress.placed)
      ? progress.placed.filter((id): id is string => typeof id === 'string') : []
    const player = Array.isArray(progress.player) && progress.player.length === 3 && progress.player.every(Number.isFinite)
      ? progress.player as Point : [...spawn] as Point
    const celebrated = Array.isArray(progress.celebrated)
      ? progress.celebrated.filter((id): id is Mission => missionIds.has(id)) : []
    return {
      legacy,
      game: {
        version: 2,
        settings: {
          quality: settings.quality && ['auto', 'high', 'low'].includes(settings.quality) ? settings.quality : 'auto',
          sound: settings.sound === true,
          reducedMotion: settings.reducedMotion === true,
          dayCycle: settings.dayCycle !== false,
        },
        progress: {
          started: progress.started === true, discovered: progress.discovered === true, player,
          completed: progress.completed === true, celebrated,
          time: typeof progress.time === 'number' && progress.time >= 0 && progress.time < 1 ? progress.time : 0.3,
          creative: progress.creative === true,
          facts: Array.isArray(progress.facts) ? progress.facts.filter((id): id is Fact => factIds.includes(id as Fact)) : [],
        },
      },
    }
  } catch {
    return fallback
  }
}

/** Fills the blueprint cells of the prefab pieces an old save had placed, so finished missions stay finished. */
export function migrateLegacy(placed: readonly string[]) {
  if (!placed.length) return
  const world = getWorld()
  const set = new Set(placed)
  const whole = new Set(Object.entries(legacySlots).filter(([, ids]) => ids.every((id) => set.has(id))).map(([mission]) => mission))
  for (const cell of cells) {
    if (!whole.has(cell.mission) && !set.has(cell.legacy)) continue
    if (world.get(cell.x, cell.y, cell.z) === Block.air) world.set(cell.x, cell.y, cell.z, cell.block)
  }
}

/** Missions finished in order from the start, which is how the campaign advances. */
function finishedInOrder() {
  const { counts } = useSite.getState()
  const done: Mission[] = []
  for (const { id } of objectives) {
    if (id === 'discover') continue
    if (!complete(id, counts)) break
    done.push(id)
  }
  return done
}

const loaded = load()

export const useGame = create<State>((set, get) => ({
  progress: loaded.game.progress,
  settings: loaded.game.settings,
  saveStatus: saveAvailable() ? 'ready' : 'unavailable',
  screen: 'menu',
  panel: null,
  mode: 'explore',
  milestone: null,
  facts: [],
  hotbar: 0,
  notice: null,
  setHotbar: (index) => set({ hotbar: ((index % HOTBAR) + HOTBAR) % HOTBAR }),
  openContainer: (kind, kiln) => {
    const { mode, screen, panel } = get()
    if (screen !== 'game' || mode !== 'explore' || panel) return
    inventory.open(kind === 'workshop' ? 3 : 2, kind === 'kiln' ? kiln ?? null : null)
    set({ panel: kind })
  },
  setNotice: (notice) => set({ notice }),
  start: () => set((state) => ({
    screen: 'game', panel: null, mode: 'explore', milestone: null,
    progress: state.progress.started ? state.progress : { ...state.progress, started: true },
  })),
  goHome: () => set({ screen: 'menu', panel: null, milestone: null }),
  setPanel: (panel) => set({ panel }),
  settingsChange: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  toggleOverview: () => {
    const state = get()
    if (!state.progress.discovered || state.mode === 'tour' || state.panel) return
    set({ mode: state.mode === 'overview' ? 'explore' : 'overview' })
  },
  updatePlayer: (player) => set((state) => ({ progress: { ...state.progress, player } })),
  interact: () => {
    const { progress } = get()
    if (!interactionAvailable(get())) return
    if (!progress.discovered) {
      // Anything already built before the plan was activated counts, without a burst of celebrations.
      set({ progress: { ...progress, discovered: true, celebrated: finishedInOrder() }, milestone: 'discover' })
    } else if (entrancesReady(useSite.getState().counts)) {
      set({ mode: 'tour', milestone: null })
    }
  },
  endTour: () => set((state) => ({
    mode: 'explore', panel: 'complete', progress: { ...state.progress, completed: true },
  })),
  restartMission: () => {
    const { progress } = get()
    const world = getWorld()
    const mission = activeMission(progress.discovered, useSite.getState().counts)
    // Taking the mission's blocks down gives them back, so nothing the player gathered is lost.
    const refund = new Map<string, number>()
    for (const cell of cells) {
      if (cell.mission !== mission || !builtIn(world, cell)) continue
      const key = blocks[world.get(cell.x, cell.y, cell.z)].key
      world.set(cell.x, cell.y, cell.z, Block.air)
      refund.set(key, (refund.get(key) ?? 0) + 1)
    }
    const [x, , z] = progress.player
    for (const [item, count] of refund) {
      for (let left = count; left > 0; left -= 64) {
        const stack = { item, count: Math.min(64, left) }
        const rest = inventory.add(stack)
        if (rest) spawnDrop({ item, count: rest }, x, getWorld().surface(x, z) + 0.5, z)
      }
    }
    set({
      progress: { ...progress, completed: false, celebrated: progress.celebrated.filter((id) => id !== mission) },
      panel: null, milestone: null,
    })
  },
  reset: () => {
    resetWorld()
    resetInventory()
    clearDrops()
    set({ screen: 'menu', panel: null, mode: 'explore', progress: initialProgress(), milestone: null, notice: null, facts: [] })
  },
  dismissMilestone: () => set({ milestone: null }),
  setTime: (time) => set((state) => ({ progress: { ...state.progress, time } })),
  setCreative: (creative) => {
    set((state) => ({ progress: { ...state.progress, creative } }))
    if (creative) stockCreativeHotbar()
  },
  learn: (fact) => {
    const { progress, facts } = get()
    if (progress.facts.includes(fact) || facts.includes(fact)) return
    set({ facts: [...facts, fact], progress: { ...progress, facts: [...progress.facts, fact] } })
  },
  dismissFact: () => set((state) => ({ facts: state.facts.slice(1) })),
}))

/** Creative play starts with building stone in the empty hotbar slots. */
const creativeKit = ['ashlar', 'marble', 'limestone', 'oliveLog', 'terracotta', 'planks', 'lamp', 'wool', 'grass']
function stockCreativeHotbar() {
  const { slots } = useInventory.getState()
  const next = [...slots]
  const missing = creativeKit.filter((key) => !slots.some((slot) => slot?.item === key))
  for (let i = 0; i < HOTBAR && missing.length; i++) if (!next[i]) next[i] = { item: missing.shift()!, count: 64 }
  useInventory.setState({ slots: next })
}

// Rebuild old prefab saves as blocks, then follow the world for mission progress.
trackSite(getWorld())
migrateLegacy(loaded.legacy)

useSite.subscribe((site, previous) => {
  const state = useGame.getState()
  const { progress } = state
  if (!progress.discovered) return
  const mission = activeMission(true, previous.counts)
  // A correct block in the current mission rings like the old placement chime.
  if (state.screen === 'game' && state.settings.sound && site.counts[mission] > previous.counts[mission]) placementSound()
  const fresh = finishedInOrder().filter((id) => !progress.celebrated.includes(id))
  if (!fresh.length) return
  useGame.setState({
    progress: { ...progress, celebrated: [...progress.celebrated, ...fresh] },
    milestone: state.screen === 'game' ? fresh.at(-1)! : state.milestone,
  })
})

useGame.subscribe((state, previous) => {
  if (state.progress === previous.progress && state.settings === previous.settings) return
  writeRecord('game', { version: 2, progress: state.progress, settings: state.settings } satisfies SavedGame)
})

onSaveStatus((ok) => {
  const saveStatus = ok ? 'ready' : 'unavailable'
  if (useGame.getState().saveStatus !== saveStatus) useGame.setState({ saveStatus })
})

// An upgraded prefab-era save is rewritten at once, so its pieces are never rebuilt twice.
if (loaded.legacy.length) {
  useGame.setState((state) => ({
    progress: { ...state.progress, celebrated: state.progress.discovered ? finishedInOrder() : [] },
  }))
}
