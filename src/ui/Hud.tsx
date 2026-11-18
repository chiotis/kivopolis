import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  ArrowDown, ArrowDownLeft, MapPin, MessageCircle, RefreshCw, Users, ArrowLeft, ArrowRight, ArrowUp, Award, BookOpen, Check, ChevronDown, ChevronUp, CircleHelp, Compass,
  Backpack, Camera, ChevronsUp, DraftingCompass, Eye, EyeOff, Footprints, Lightbulb, Maximize, Minimize, Landmark, Mouse, Move, Pause, Pickaxe, Plus, Route, Settings2, Sparkles, X, HeartPulse } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { buildings, copy, itemName, missions, stepText } from '../game/el'
import { activeStep, planOf, planSteps, stepMaterials, stepPoints, stepReady, stepTotal, usePlans, type Plan } from '../game/plans'
import { inRoom } from '../game/save'
import { TUNICS, roomActions, useRoom } from '../net/roomState'
import { PHRASES, type PlayerInfo } from '../net/protocol'
import { buildingHere, buildingStatus, previousBuilding, signNear } from '../game/buildings'
import { interactionRadius, useGame, useShared } from '../game/store'
import { objectives, siteMarker, tourMarker } from '../game/theatre'
import { activeMission, builtTotal, earnedPoints, entrancesReady, missionCounts, materials, partStates, totalCells, useSite } from '../game/site'
import { blocks } from '../voxel/blocks'
import { cells } from '../game/blueprints/theatre'
import { keys } from '../world/camera'
import { blockInput, jumpTapped } from '../world/player'
import { savePicture } from '../world/picture'
import { MAX_HEALTH, useSurvival } from '../game/survival'
import { HOTBAR, useInventory } from '../game/inventory'
import { ItemIcon, StackView } from './ItemIcon'
import { PartsBar } from './Parts'
import type { Stack } from '../game/items'

/** Blocks the current mission still needs, next to how many the player carries. */
/** Each material of the current mission: blocks already in place out of all its blueprint cells. */
function Materials({ list }: { list: ReturnType<typeof materials> }) {
  if (!list.length) return null
  return (
    <ul className="mission-needs" aria-label={copy.needs}>
      {list.map(({ block, placed, total }) => {
        const key = blocks[block].key
        return <li key={key} title={itemName(key)} className={placed >= total ? 'done' : ''}>
          <ItemIcon item={key} /><span>{itemName(key)}</span><strong>{placed} / {total}</strong>
        </li>
      })}
    </ul>
  )
}

export function MissionPanel() {
  const { setPanel } = useGame()
  const progress = useShared()
  const player = useGame((state) => state.player)
  const { counts, missing, wrong } = useSite()
  const [brief, setBrief] = useState(() => !globalThis.matchMedia?.('(max-width: 760px)').matches)
  const mission = activeMission(progress.discovered, counts)
  const index = objectives.findIndex(({ id }) => id === mission)
  const info = missions[mission]
  const { done, total } = missionCounts(mission, counts)
  const points = earnedPoints(progress.discovered, counts, progress.completed)
  const states = partStates(progress.discovered, progress.completed, counts)
  const misplaced = wrong.filter((i) => cells[i].mission === mission).length
  // In one of the new areas the panel tells about the building there instead of the theatre's step.
  const here = buildingHere(player[0], player[2])
  const plan = here ? planOf(here) : null
  if (here && plan && buildingStatus(progress, here) !== 'locked') return <PlanPanel plan={plan} brief={brief} setBrief={setBrief} />
  if (here && here !== 'theatre') {
    const status = buildingStatus(progress, here)
    return (
      <aside className="hud-panel hud-quest" aria-label={copy.mission}>
        <div className="quest-head"><span className="pixel quest-step">{copy.buildingHere}</span></div>
        <h2 className="pixel">{buildings[here].title}</h2>
        <p className="quest-text">{status === 'locked' ? copy.buildingLocked(buildings[previousBuilding(here)].title.toLocaleLowerCase('el')) : copy.buildingComing}</p>
      </aside>
    )
  }
  return (
    <aside className="hud-panel hud-quest" aria-label={copy.mission}>
      <div className="quest-head">
        <span className="pixel quest-step">{copy.mission} {String(index + 1).padStart(2, '0')}/{String(objectives.length).padStart(2, '0')}</span>
        <button className="hud-mini" onClick={() => setBrief(!brief)} aria-expanded={brief} aria-label={copy.missionBrief} title={copy.missionBrief}>
          {brief ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      <h2 className="pixel">{info.title}</h2>
      {brief && <p className="quest-text">{info.description}</p>}
      {total > 0 && <div className="quest-progress">
        <div><span>{copy.placed}</span><strong className="pixel" data-testid="mission-count">{done} / {total}</strong></div>
        <span className="xp-bar" role="progressbar" aria-label={copy.placed} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <span style={{ width: `${(done / total) * 100}%` }} />
        </span>
      </div>}
      {progress.discovered && total > 0 && <Materials list={materials(mission, missing, wrong)} />}
      {progress.discovered && misplaced > 0 && <p className="quest-warning">{copy.wrongBlocks}</p>}
      <ol className="quest-steps" aria-label={copy.total}>
        {objectives.map(({ id }) => {
          const state = states[id]
          return <li key={id} title={missions[id].title} className={state === 'done' ? 'done' : state === 'active' ? 'current' : ''}>
            <span className="visually-hidden">{missions[id].title}</span>
          </li>
        })}
      </ol>
      <div className="quest-foot">
        <span title={copy.total}><Landmark size={13} /><span className="pixel">{Math.round(builtTotal(counts) / totalCells * 100)}%</span></span>
        <span title={copy.points}><Sparkles size={13} /><strong className="pixel" data-testid="points">{points.toLocaleString('el')}</strong></span>
        <button className="hud-mini wide" onClick={() => setPanel('journal')}><BookOpen size={13} />{copy.journal}</button>
      </div>
    </aside>
  )
}

/** The mission panel for a building after the theatre: its current step, as for the theatre. */
function PlanPanel({ plan, brief, setBrief }: { plan: Plan; brief: boolean; setBrief: (brief: boolean) => void }) {
  const { setPanel } = useGame()
  const known = useShared((state) => state.buildings[plan.id])
  const site = usePlans((state) => state.sites[plan.id])
  if (!site) return null
  const discovered = known?.discovered ?? false
  const step = activeStep(plan, site.counts)
  const index = step ? plan.steps.findIndex(({ id }) => id === step) : plan.steps.length - 1
  const ready = step ? stepReady(plan, step) : false
  const info = step ? stepText(step) : null
  const total = step ? stepTotal(plan, step) : 0
  const done = step ? site.counts[step] ?? 0 : 0
  const misplaced = step ? site.wrong.filter((i) => plan.cells[i].step === step).length : 0
  const celebrated = known?.celebrated ?? []
  return (
    <aside className="hud-panel hud-quest" aria-label={copy.mission}>
      <div className="quest-head">
        <span className="pixel quest-step">{buildings[plan.id].title.toLocaleUpperCase('el')} · {copy.stepOf} {String(index + 1).padStart(2, '0')}/{String(plan.steps.length).padStart(2, '0')}</span>
        <button className="hud-mini" onClick={() => setBrief(!brief)} aria-expanded={brief} aria-label={copy.missionBrief} title={copy.missionBrief}>
          {brief ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      <h2 className="pixel">{info?.title ?? buildings[plan.id].title}</h2>
      {brief && <p className="quest-text">{!discovered ? copy.readTheSign : !step ? copy.buildingDone : ready ? info?.description : copy.stepComing}</p>}
      {discovered && ready && <div className="quest-progress">
        <div><span>{copy.placed}</span><strong className="pixel" data-testid="mission-count">{done} / {total}</strong></div>
        <span className="xp-bar" role="progressbar" aria-label={copy.placed} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <span style={{ width: `${(done / total) * 100}%` }} />
        </span>
      </div>}
      {discovered && ready && step && <Materials list={stepMaterials(plan, step, site)} />}
      {discovered && misplaced > 0 && <p className="quest-warning">{copy.wrongBlocks}</p>}
      <ol className="quest-steps" aria-label={copy.total}>
        {plan.steps.map(({ id }, i) => (
          <li key={id} title={stepText(id)?.title} className={celebrated.includes(id) || i < index ? 'done' : i === index ? 'current' : ''}>
            <span className="visually-hidden">{stepText(id)?.title}</span>
          </li>
        ))}
      </ol>
      <div className="quest-foot">
        <span title={copy.points}><Sparkles size={13} /><strong className="pixel">{stepPoints(plan, celebrated).toLocaleString('el')}</strong></span>
        <button className="hud-mini wide" onClick={() => setPanel('journal')}><BookOpen size={13} />{copy.journal}</button>
      </div>
    </aside>
  )
}

export function StageOverlay({ blueprint, setBlueprint, marker }: {
  blueprint: boolean; setBlueprint: (value: boolean) => void; marker: RefObject<HTMLDivElement | null>
}) {
  const { player, mode, tour, toggleOverview, interact, setPanel, endTour, saveStatus, photo, setPhoto } = useGame()
  const progress = useShared()
  const started = progress.discovered
  const gates = entrancesReady(useSite((state) => state.counts))
  const point = started ? tourMarker : siteMarker
  const nearby = Math.hypot(player[0] - point[0], player[2] - point[2]) <= interactionRadius
  const sign = signNear(player[0], player[2])
  const showInteract = mode === 'explore' && (Boolean(sign) || ((!started || gates) && nearby))
  const overview = mode === 'overview'
  if (photo) return <PhotoBar leave={() => setPhoto(false)} />
  return (
    // Android opens a context menu on a long press; holding a movement or action button is play, not a menu.
    <div className="stage-overlay" onContextMenu={(event) => event.preventDefault()}>
      <div className="hud-left">
        <div className="hud-panel hud-bar">
          <button className="hud-icon" onClick={() => setPanel('pause')} aria-label={copy.pause} title={`${copy.pause} (Esc)`}><Pause size={16} /></button>
          <button className="hud-icon" onClick={() => setPanel('help')} aria-label={copy.help} title={copy.help}><CircleHelp size={16} /></button>
          <button className="hud-icon" onClick={() => setPanel('settings')} aria-label={copy.settings} title={copy.settings}><Settings2 size={16} /></button>
          <FullscreenButton />
          {mode !== 'tour' && <button className="hud-icon" onClick={() => setPhoto(true)} aria-label={copy.photoMode} title={copy.photoMode}><Camera size={16} /></button>}
          {overview && <button className="hud-icon" aria-label={copy.blueprintToggle} aria-pressed={blueprint} onClick={() => setBlueprint(!blueprint)}>
            {blueprint ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>}
          <span className={`hud-save ${saveStatus === 'unavailable' ? 'unsaved' : ''}`} title={saveStatus === 'ready' ? copy.saved : copy.unsaved}><Check size={13} /></span>
        </div>
        <span className="hud-panel hud-mode pixel">{mode === 'overview' ? copy.overview : mode === 'tour' ? copy.tour : copy.explore}{progress.creative ? <small> · {copy.modeCreative}</small> : progress.survival && <small> · {copy.modeSurvival}</small>}</span>
        <div className="compass" aria-hidden="true"><span>{copy.compass}</span><Compass size={18} strokeWidth={1.4} /></div>
        {inRoom() && <RoomPanel />}
      </div>
      <PartsBar />
      <div className="hud-right">
        <Milestone />
        <FactToast />
        {mode === 'explore' && !progress.creative && <Guide />}
        {mode !== 'tour' && <MissionPanel />}
      </div>
      {mode === 'explore' && <><HurtFlash /><Crosshair /><TouchMovement /><TouchActions /><Notice /><BreakMeter /></>}
      {inRoom() && mode === 'explore' && <><PhraseMenu /><RoomMessages /></>}
      {mode === 'explore' && (!started || gates) && <div ref={marker} className="scene-marker">
        {started ? <Route size={17} /> : <Landmark size={17} />}
        <span>{started ? copy.tour : copy.site}</span>
      </div>}
      <div className="stage-bottom">
        <div className="stage-keys">
          {mode === 'tour' ? <span><Route size={15} />{tour === 'stadium' ? copy.stadiumTourHint : copy.tourHint}</span>
            : overview ? <><span><kbd>W A S D</kbd>{copy.slide}</span><span><Move size={15} />{copy.orbit}</span><span><Mouse size={15} />{copy.zoom}</span></>
              : <><span><kbd>W A S D</kbd>{copy.movement}</span><span><Mouse size={15} />{copy.blocksHint}</span><span><kbd>E</kbd>{copy.backpackKey}</span></>}
        </div>
        <div className="stage-actions">
          {mode === 'tour' && <button className="button stage-button" onClick={endTour}>{copy.finishTour}</button>}
          {mode !== 'tour' && progress.completed && <button className="button stage-button" onClick={() => setPanel(progress.buildings.stadium?.completed ? 'finale' : 'complete')}><Award size={17} />{copy.showResult}</button>}
          {showInteract && <button className="button primary stage-button" onClick={interact}><kbd>E</kbd>{sign ? copy.readSign : started ? copy.startTour : copy.interact}</button>}
          {mode !== 'tour' && started && <button className="button stage-button" onClick={toggleOverview}>
            {overview ? <Footprints size={17} /> : <DraftingCompass size={17} />}{overview ? copy.explore : copy.overview}<kbd>B</kbd>
          </button>}
        </div>
      </div>
      {mode === 'explore' && <Hotbar />}
      {mode === 'explore' && (!started || (gates && !progress.completed)) && !nearby && (
        <div className="objective-hint"><ArrowDownLeft size={16} />{started ? copy.nearTour : copy.nearSite}</div>
      )}
    </div>
  )
}

/** Screenshot mode: only the world shows, with two small buttons to save a picture or go back. */
function PhotoBar({ leave }: { leave: () => void }) {
  return (
    <div className="stage-overlay photo-mode" onContextMenu={(event) => event.preventDefault()}>
      <div className="photo-bar">
        <button className="hud-icon" onClick={() => void savePicture()} aria-label={copy.takePicture} title={copy.takePicture}><Camera size={17} /></button>
        <button className="hud-icon" onClick={leave} aria-label={copy.leavePhoto} title={copy.leavePhoto}><X size={17} /></button>
      </div>
    </div>
  )
}

/** Optional browser full screen; hidden where the browser does not allow it (such as Safari on iPhone). */
function FullscreenButton() {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement))
  useEffect(() => {
    const change = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])
  if (!document.fullscreenEnabled) return null
  const toggle = () => {
    const request = full ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    void request?.catch(() => undefined)
  }
  const label = full ? copy.exitFullscreen : copy.fullscreen
  return <button className="hud-icon" onClick={toggle} aria-label={label} aria-pressed={full} title={label}>
    {full ? <Minimize size={16} /> : <Maximize size={16} />}
  </button>
}

const touchDirections = [
  { key: 'w', label: copy.moveUp, Icon: ArrowUp, pos: 'north' },
  { key: 'a', label: copy.moveLeft, Icon: ArrowLeft, pos: 'west' },
  { key: 's', label: copy.moveDown, Icon: ArrowDown, pos: 'south' },
  { key: 'd', label: copy.moveRight, Icon: ArrowRight, pos: 'east' },
]
function TouchMovement() {
  return (
    <div className="touch-movement" aria-label={copy.movement}>
      {touchDirections.map(({ key, label, Icon, pos }) => (
        <button key={key} className={pos} aria-label={label}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); keys.add(key) }}
          onLostPointerCapture={() => keys.delete(key)} onPointerUp={() => keys.delete(key)} onPointerCancel={() => keys.delete(key)}>
          <Icon size={20} />
        </button>
      ))}
    </div>
  )
}

function Crosshair() {
  return <div className="crosshair" aria-hidden="true" />
}

/** Survival: this player's health, ten segments of two points each. */
function Health() {
  const health = useSurvival((state) => state.health)
  const shown = useShared((state) => state.survival && !state.creative)
  if (!shown) return null
  const segments = Array.from({ length: MAX_HEALTH / 2 }, (_, i) => Math.min(2, Math.max(0, health - i * 2)))
  return (
    <div className="health" role="meter" aria-label={copy.health} aria-valuemin={0} aria-valuemax={MAX_HEALTH} aria-valuenow={health}
      title={`${copy.health}: ${health}/${MAX_HEALTH}`}>
      <HeartPulse size={13} aria-hidden="true" />
      {segments.map((fill, i) => <span key={i} className={`health-cell fill-${fill}`} />)}
    </div>
  )
}

/** A red edge round the screen for a moment after a hurt. */
function HurtFlash() {
  const hurtAt = useSurvival((state) => state.hurtAt)
  return Number.isFinite(hurtAt) ? <div key={hurtAt} className="hurt-flash" aria-hidden="true" /> : null
}

function Hotbar() {
  const hotbar = useGame((state) => state.hotbar)
  const setHotbar = useGame((state) => state.setHotbar)
  const slots = useInventory((state) => state.slots)
  const current = slots[hotbar]
  return (
    <div className="hotbar-wrap">
      <Health />
      <span className="hotbar-label" aria-live="polite">{current ? itemName(current.item) : copy.emptyHand}</span>
      <div className="hotbar" role="toolbar" aria-label={copy.hotbar}>
        {slots.slice(0, HOTBAR).map((stack, index) => (
          <button key={index} className={index === hotbar ? 'active' : ''} aria-pressed={index === hotbar}
            aria-label={`${index + 1}: ${stack ? itemName(stack.item) : copy.emptyHand}`}
            title={`${index + 1} · ${stack ? itemName(stack.item) : copy.emptyHand}`}
            onClick={() => setHotbar(index)}>
            <StackView stack={stack} /><span className="slot-key">{index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function holdButton(onDown: () => void, onUp: () => void) {
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => { event.currentTarget.setPointerCapture(event.pointerId); onDown() },
    onPointerUp: onUp, onPointerCancel: onUp, onLostPointerCapture: onUp,
  }
}

function TouchActions() {
  return (
    <div className="touch-actions">
      <button aria-label={copy.breakBlock} {...holdButton(() => { blockInput.breaking = true; blockInput.breakOnce = true }, () => { blockInput.breaking = false })}><Pickaxe size={20} /></button>
      <button aria-label={copy.placeBlock} {...holdButton(() => { blockInput.placeOnce = true; blockInput.placing = true }, () => { blockInput.placing = false })}><Plus size={22} /></button>
      <button aria-label={copy.jump} {...holdButton(() => { keys.add(' '); jumpTapped(useShared.getState().creative) }, () => keys.delete(' '))}><ChevronsUp size={22} /></button>
      <button aria-label={copy.backpack} onClick={() => useGame.getState().openContainer('inventory')}><Backpack size={20} /></button>
    </div>
  )
}

/** A crack meter under the crosshair, so holding the button visibly does something. */
function BreakMeter() {
  const bar = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const el = bar.current
      if (el) {
        const value = blockInput.breaking ? blockInput.progress : 0
        el.parentElement!.style.visibility = value > 0 ? 'visible' : 'hidden'
        el.style.width = `${Math.min(1, value) * 100}%`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <div className="break-meter" aria-hidden="true"><span ref={bar} /></div>
}

const guideKey = 'ancient-polis-guide-hidden'
const has = (slots: (Stack | null)[], ...items: string[]) => slots.some((slot) => slot && items.includes(slot.item))

/** Which first step the player is on, judged from what they carry; null once they hold dressed stone. */
export function guideStep(slots: (Stack | null)[], orchestraStarted: boolean) {
  if (orchestraStarted || has(slots, 'ashlar')) return null
  if (has(slots, 'limestone')) return 4
  if (has(slots, 'woodPickaxe', 'stonePickaxe', 'bronzePickaxe')) return 3
  if (has(slots, 'planks', 'stick', 'workshop')) return 2
  if (has(slots, 'oliveLog')) return 1
  return 0
}

/** Step-by-step help from the first trunk to the first dressed stone, in the top-right column. */
function Guide() {
  const slots = useInventory((state) => state.slots)
  const started = useSite((state) => state.counts.orchestra > 0)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(guideKey) === '1' } catch { return false } })
  const step = guideStep(slots, started)
  if (step === null) return null
  const remember = (value: boolean) => {
    setHidden(value)
    try { if (value) localStorage.setItem(guideKey, '1'); else localStorage.removeItem(guideKey) } catch { /* optional */ }
  }
  if (hidden) return <button className="hud-panel guide-reopen pixel" onClick={() => remember(false)}><Lightbulb size={14} />{copy.guideShow}</button>
  const { title, text } = copy.guideSteps[step]
  return (
    <section className="hud-panel hud-guide" aria-label={copy.guide}>
      <div className="quest-head">
        <span className="pixel quest-step"><Lightbulb size={13} /> {copy.guide} {step + 1}/{copy.guideSteps.length}</span>
        <button className="hud-mini" onClick={() => remember(true)} aria-label={copy.guideHide} title={copy.guideHide}><X size={13} /></button>
      </div>
      <h3 className="pixel">{title}</h3>
      <p className="quest-text">{text}</p>
    </section>
  )
}

function Notice() {
  const { notice, setNotice } = useGame()
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timer)
  }, [notice, setNotice])
  return notice ? <div className="world-notice" role="status">{notice}</div> : null
}

/** A short history note the first time something happens: nightfall, a lamp, meeting an animal. */
function FactToast() {
  const fact = useGame((state) => state.facts[0])
  const dismissFact = useGame((state) => state.dismissFact)
  const reducedMotion = useGame((state) => state.settings.reducedMotion)
  useEffect(() => {
    if (!fact) return
    const timer = window.setTimeout(dismissFact, 12000)
    return () => window.clearTimeout(timer)
  }, [fact, dismissFact])
  const note = fact ? copy.facts[fact] : null
  return (
    <AnimatePresence>
      {fact && note && <motion.div key={fact} className="hud-panel hud-toast hud-fact" role="status" onClick={dismissFact}
        initial={{ opacity: 0, x: reducedMotion ? 0 : 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : 60 }}>
        <span className="toast-icon"><BookOpen size={19} /></span>
        <div>
          <span className="pixel toast-kicker">{copy.fact}</span>
          <strong className="pixel">{note.title}</strong>
          <p>{note.text}</p>
        </div>
      </motion.div>}
    </AnimatePresence>
  )
}

export function Milestone() {
  const { milestone, dismissMilestone, settings } = useGame()
  useEffect(() => {
    if (!milestone) return
    const timer = window.setTimeout(dismissMilestone, 9000)
    return () => window.clearTimeout(timer)
  }, [milestone, dismissMilestone])
  const item = objectives.find(({ id }) => id === milestone) ?? planSteps.get(milestone ?? '')?.steps.find(({ id }) => id === milestone)
  const text = milestone && milestone !== 'discover' ? stepText(milestone) : null
  return (
    <AnimatePresence>
      {milestone && <motion.div key={milestone} className="hud-panel hud-toast" role="status" onClick={dismissMilestone}
        initial={{ opacity: 0, x: settings.reducedMotion ? 0 : 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: settings.reducedMotion ? 0 : 60 }}>
        <span className="toast-icon"><Award size={20} /></span>
        <div>
          <span className="pixel toast-kicker">{copy.milestone}{Boolean(item?.reward) && milestone !== 'finish' && ` +${item?.reward}`}</span>
          <strong className="pixel">{milestone === 'discover' ? copy.discovered : text?.title}</strong>
          <p>{milestone === 'discover' ? missions.discover.note : text?.note}</p>
        </div>
      </motion.div>}
    </AnimatePresence>
  )
}

/** The room's code to share, and who is playing: each name in the colour of their tunic. */
function RoomPanel() {
  const { code, me, players, status, phrasing } = useRoom()
  if (!code || !me) return null
  const everyone = [me, ...players]
  const remove = (player: PlayerInfo) => { if (confirm(copy.removeConfirm(player.name))) roomActions.kick(player.id) }
  return (
    <section className="hud-panel hud-room" aria-label={copy.inRoom}>
      <div className="room-head"><Users size={14} /><span className="pixel">{copy.inRoom}</span><strong className="pixel" title={copy.roomCodeShare}>{code}</strong></div>
      <ul>
        {everyone.map((player) => (
          <li key={player.id}><span className="room-dot" style={{ background: TUNICS[player.color % TUNICS.length] }} />
            {player.name}{player.id === me.id && <small> · {copy.roomYou}</small>}{player.host && <small> · {copy.roomHost}</small>}
            {me.host && player.id !== me.id && <button className="room-remove" onClick={() => remove(player)} aria-label={`${copy.removePlayer}: ${player.name}`} title={copy.removePlayer}><X size={12} /></button>}</li>
        ))}
      </ul>
      <button className="hud-mini wide" onClick={() => useRoom.setState({ phrasing: !phrasing })} aria-expanded={phrasing}><MessageCircle size={13} />{copy.phrases}</button>
      <small className="room-keys">{copy.phraseKeys}</small>
      {status === 'reconnecting' && <div className="room-lost" role="status">{copy.reconnecting}</div>}
      {status === 'lost' && <div className="room-lost" role="alert">{copy.roomLost}
        <button className="hud-mini wide" onClick={() => location.reload()}><RefreshCw size={13} />{copy.reconnect}</button></div>}
    </section>
  )
}

/** The preset phrases (T, then 1–9), and pointing at the block in sight. */
function PhraseMenu() {
  const phrasing = useRoom((state) => state.phrasing)
  if (!phrasing) return null
  const close = () => useRoom.setState({ phrasing: false })
  return (
    <section className="hud-panel phrase-menu" aria-label={copy.phrases}>
      <ol>
        {PHRASES.map((phrase, i) => <li key={phrase}><button onClick={() => { roomActions.say(i); close() }}><kbd>{i + 1}</kbd>{phrase}</button></li>)}
      </ol>
      <button className="hud-mini wide" onClick={() => { if (blockInput.aim) roomActions.point(blockInput.aim); close() }}><MapPin size={13} />{copy.pointHere} <kbd>G</kbd></button>
    </section>
  )
}

/** What players said in the last few seconds, in their colours. */
function RoomMessages() {
  const messages = useRoom((state) => state.messages)
  if (!messages.length) return null
  return (
    <ul className="room-messages" aria-live="polite">
      {messages.map((message) => (
        <li key={message.key} className="hud-panel"><strong style={{ color: TUNICS[message.color % TUNICS.length] }}>{message.name}</strong> {PHRASES[message.phrase]}</li>
      ))}
    </ul>
  )
}
