import { create } from 'zustand'
import { objectives, siteMarker, spawn, tourMarker, type Mission, type Point } from './theatre'
import { cells, legacySlots } from './blueprints/theatre'
import { activeMission, complete, entrancesReady, trackSite, useSite } from './site'
import { placementSound } from './audio'
import { isEmpty } from '../voxel/blocks'
import { getWorld, resetWorld } from '../voxel/world'
import { HOTBAR, resetInventory, useInventory } from './inventory'
import { clearDrops } from '../world/dropState'
import { onSaveStatus, readRecord, saveAvailable, writeRecord } from './save'
import { buildingStatus, readBuildings, signNear } from './buildings'
import { factIds, initialShared, useShared, type Fact, type Shared } from './shared'
import { apply } from './actions'
import type { BuildingId } from './regions'

export { factIds, useShared, type Fact, type Shared } from './shared'

export const interactionRadius = 2.55
/** Explore is the first-person game; overview is the orbiting architect's camera; tour is the finale. */
export type Mode = 'explore' | 'overview' | 'tour'
export type Panel = 'settings' | 'help' | 'journal' | 'pause' | 'reset' | 'new' | 'complete' | 'inventory' | 'workshop' | 'kiln' | 'part' | 'building' | 'room'
/** Device settings: they belong to this browser, never to a shared room. */
export interface Settings {
  quality: 'auto' | 'high' | 'low'; sound: boolean; reducedMotion: boolean; dayCycle: boolean
  /** First-person field of view in degrees (vertical). */
  fov: number
  /** Look speed multiplier for mouse and touch. */
  sensitivity: number
  invertY: boolean
}
export const fovRange = [50, 100] as const
export const sensitivityRange = [0.3, 2.5] as const
const within = (value: unknown, [low, high]: readonly [number, number], fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback

/**
 * Saved game, version 3: the shared game, this player's position and the device settings, kept
 * apart so a room can own the shared part (Phase 12). Versions 1 and 2 kept them in one `progress`.
 */
interface SavedGame { version: 3; shared: Shared; player: { position: Point }; settings: Settings }

/** This player and this device: everything that is not shared with a room. */
interface State {
  /** Where this player stands (saved, so the game resumes there). */
  player: Point
  settings: Settings
  saveStatus: 'ready' | 'unavailable'
  screen: 'menu' | 'game'
  panel: Panel | null
  /** The theatre part whose knowledge text the 'part' panel shows. */
  part: Mission | null
  /** The building whose signpost the 'building' panel shows. */
  building: BuildingId | null
  /** The step just finished, congratulated at the top of the next step's window. */
  congrats: Mission | null
  mode: Mode
  milestone: Mission | null
  /** Notes waiting to pop up in the top-right corner, oldest first. */
  facts: Fact[]
  /** Selected hotbar slot while exploring. */
  hotbar: number
  /** Short-lived message shown over the world, such as a refused block edit. */
  notice: string | null
  /** Screenshot mode: the interface is hidden so only the world shows. */
  photo: boolean
  setPhoto: (photo: boolean) => void
  setHotbar: (index: number) => void
  setNotice: (notice: string | null) => void
  /** Opens the backpack (2 × 2 crafting), a workshop (3 × 3) or the kiln at a world cell. */
  openContainer: (kind: 'inventory' | 'workshop' | 'kiln', kiln?: string) => void
  start: () => void
  goHome: () => void
  setPanel: (panel: Panel | null) => void
  /** Opens the knowledge text of one part of the theatre. */
  openPart: (part: Mission, congrats?: Mission | null) => void
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

/** True when the player stands by a signpost, the site sign (before discovery) or the tour point (once the gates stand). */
export function interactionAvailable(state: Pick<State, 'player' | 'panel' | 'mode'>) {
  const { player } = state
  if (state.mode !== 'explore' || state.panel) return false
  if (signNear(player[0], player[2])) return true
  const { discovered } = useShared.getState()
  if (discovered && !entrancesReady(useSite.getState().counts)) return false
  const point = discovered ? tourMarker : siteMarker
  return Math.hypot(player[0] - point[0], player[2] - point[2]) <= interactionRadius
}

const defaults: Settings = { quality: 'auto', sound: false, reducedMotion: false, dayCycle: true, fov: 70, sensitivity: 1, invertY: false }
const missionIds = new Set<string>(objectives.map(({ id }) => id))

interface Loaded { game: SavedGame; legacy: string[] }

const isPoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)

function readSettings(settings: Partial<Settings>): Settings {
  return {
    quality: settings.quality && ['auto', 'high', 'low'].includes(settings.quality) ? settings.quality : 'auto',
    sound: settings.sound === true,
    reducedMotion: settings.reducedMotion === true,
    dayCycle: settings.dayCycle !== false,
    fov: within(settings.fov, fovRange, defaults.fov),
    sensitivity: within(settings.sensitivity, sensitivityRange, defaults.sensitivity),
    invertY: settings.invertY === true,
  }
}

function readShared(shared: Partial<Shared>): Shared {
  return {
    started: shared.started === true, discovered: shared.discovered === true, completed: shared.completed === true,
    celebrated: Array.isArray(shared.celebrated) ? shared.celebrated.filter((id): id is Mission => missionIds.has(id)) : [],
    buildings: readBuildings(shared.buildings),
    facts: Array.isArray(shared.facts) ? shared.facts.filter((id): id is Fact => factIds.includes(id as Fact)) : [],
    time: typeof shared.time === 'number' && shared.time >= 0 && shared.time < 1 ? shared.time : 0.3,
    creative: shared.creative === true,
  }
}

function load(): Loaded {
  const fallback: Loaded = { game: { version: 3, shared: initialShared(), player: { position: [...spawn] }, settings: defaults }, legacy: [] }
  try {
    type Old = Partial<Shared> & { player?: unknown; placed?: unknown }
    const data = readRecord<{ version?: number; progress?: Old; shared?: Partial<Shared>; player?: { position?: unknown }; settings?: Partial<Settings> }>('game')
    if (!data || !data.settings) return fallback
    if (data.version === 3 && data.shared) {
      return {
        legacy: [],
        game: {
          version: 3, shared: readShared(data.shared), settings: readSettings(data.settings),
          player: { position: isPoint(data.player?.position) ? data.player.position : [...spawn] },
        },
      }
    }
    if ((data.version !== 1 && data.version !== 2) || !data.progress) return fallback
    const { progress } = data
    // Saves from the prefab era list placed slot ids; they are rebuilt as blocks below.
    const legacy = data.version === 1 && Array.isArray(progress.placed)
      ? progress.placed.filter((id): id is string => typeof id === 'string') : []
    return {
      legacy,
      game: {
        version: 3, shared: readShared(progress), settings: readSettings(data.settings),
        player: { position: isPoint(progress.player) ? progress.player : [...spawn] },
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
    // Loading an old save is not a player's change, so it writes the world directly.
    if (isEmpty(world.get(cell.x, cell.y, cell.z))) world.set(cell.x, cell.y, cell.z, cell.block)
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
useShared.setState(loaded.game.shared)

/** Changes the shared game. In a room (Phase 12) this becomes a message to the room server. */
const share = (patch: Partial<Shared>) => useShared.setState(patch)

export const useGame = create<State>((set, get) => ({
  player: loaded.game.player.position,
  settings: loaded.game.settings,
  saveStatus: saveAvailable() ? 'ready' : 'unavailable',
  screen: 'menu',
  panel: null,
  part: null,
  building: null,
  congrats: null,
  mode: 'explore',
  milestone: null,
  facts: [],
  hotbar: 0,
  notice: null,
  photo: false,
  setPhoto: (photo) => {
    const { screen, mode, panel } = get()
    set({ photo: photo && screen === 'game' && mode !== 'tour' && !panel })
  },
  setHotbar: (index) => set({ hotbar: ((index % HOTBAR) + HOTBAR) % HOTBAR }),
  openContainer: (kind, kiln) => {
    const { mode, screen, panel } = get()
    if (screen !== 'game' || mode !== 'explore' || panel) return
    apply({ type: 'open', craftSize: kind === 'workshop' ? 3 : 2, kiln: kind === 'kiln' ? kiln ?? null : null })
    set({ panel: kind })
  },
  setNotice: (notice) => set({ notice }),
  start: () => {
    if (!useShared.getState().started) share({ started: true })
    set({ screen: 'game', panel: null, mode: 'explore', milestone: null })
  },
  goHome: () => set({ screen: 'menu', panel: null, milestone: null }),
  setPanel: (panel) => set({ panel, congrats: null }),
  openPart: (part, congrats = null) => set({ panel: 'part', part, congrats }),
  settingsChange: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  toggleOverview: () => {
    const state = get()
    if (!useShared.getState().discovered || state.mode === 'tour' || state.panel) return
    set({ mode: state.mode === 'overview' ? 'explore' : 'overview' })
  },
  updatePlayer: (player) => set({ player }),
  interact: () => {
    const { player } = get()
    const shared = useShared.getState()
    if (!interactionAvailable(get())) return
    // A new area's signpost: tells what will stand here, and marks an open building as found.
    const sign = signNear(player[0], player[2])
    if (sign && sign !== 'theatre') {
      const known = shared.buildings[sign]
      if (buildingStatus(shared, sign) !== 'locked' && !known?.discovered) {
        share({ buildings: { ...shared.buildings, [sign]: { completed: false, celebrated: [], ...known, discovered: true } } })
      }
      set({ panel: 'building', building: sign })
      return
    }
    if (!shared.discovered) {
      // Anything already built before the plan was activated counts, without a burst of celebrations.
      share({ discovered: true, celebrated: finishedInOrder() })
      set(celebrate('discover'))
    } else if (entrancesReady(useSite.getState().counts)) {
      set({ mode: 'tour', milestone: null })
    }
  },
  endTour: () => {
    share({ completed: true })
    set({ mode: 'explore', panel: 'complete' })
  },
  restartMission: () => {
    const shared = useShared.getState()
    const mission = activeMission(shared.discovered, useSite.getState().counts)
    if (mission !== 'discover') apply({ type: 'restart', mission, at: get().player })
    share({ completed: false, celebrated: useShared.getState().celebrated.filter((id) => id !== mission) })
    set({ panel: null, milestone: null })
  },
  reset: () => {
    resetWorld()
    resetInventory()
    clearDrops()
    useShared.setState(initialShared())
    set({ screen: 'menu', panel: null, mode: 'explore', player: [...spawn], milestone: null, notice: null, facts: [] })
  },
  dismissMilestone: () => set({ milestone: null }),
  setTime: (time) => share({ time }),
  setCreative: (creative) => {
    share({ creative })
    if (creative) stockCreativeHotbar()
  },
  learn: (fact) => {
    const { facts } = get()
    const found = useShared.getState().facts
    if (found.includes(fact) || facts.includes(fact)) return
    share({ facts: [...found, fact] })
    set({ facts: [...facts, fact] })
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
  const shared = useShared.getState()
  if (!shared.discovered) return
  const mission = activeMission(true, previous.counts)
  // A correct block in the current mission rings like the old placement chime.
  if (state.screen === 'game' && state.settings.sound && site.counts[mission] > previous.counts[mission]) placementSound()
  const fresh = finishedInOrder().filter((id) => !shared.celebrated.includes(id))
  if (!fresh.length) return
  share({ celebrated: [...shared.celebrated, ...fresh] })
  if (state.screen === 'game') useGame.setState(celebrate(fresh.at(-1)!))
})

/**
 * A finished step is congratulated in the window of the step that comes next, so the player reads
 * what to build straight away. The gateways lead into the tour instead, and an open window or the
 * tour is never interrupted, so those keep the small corner note.
 */
function celebrate(done: Mission): Partial<State> {
  const state = useGame.getState()
  const next = activeMission(true, useSite.getState().counts)
  if (done === 'finish' || next === done || state.panel || state.mode === 'tour') return { milestone: done }
  return { panel: 'part', part: next, congrats: done, milestone: null }
}

// Screenshot mode ends whenever a dialog opens or the view changes.
useGame.subscribe((state, previous) => {
  if (state.photo && (state.panel || state.screen !== previous.screen || state.mode !== previous.mode)) useGame.setState({ photo: false })
})

function save() {
  const { player, settings } = useGame.getState()
  writeRecord('game', { version: 3, shared: useShared.getState(), player: { position: player }, settings } satisfies SavedGame)
}
useGame.subscribe((state, previous) => {
  if (state.player !== previous.player || state.settings !== previous.settings) save()
})
useShared.subscribe(save)

onSaveStatus((ok) => {
  const saveStatus = ok ? 'ready' : 'unavailable'
  if (useGame.getState().saveStatus !== saveStatus) useGame.setState({ saveStatus })
})

// An upgraded prefab-era save is rewritten at once, so its pieces are never rebuilt twice.
if (loaded.legacy.length) share({ celebrated: useShared.getState().discovered ? finishedInOrder() : [] })
