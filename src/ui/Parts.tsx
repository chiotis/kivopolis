import { Award, ChevronLeft, ChevronRight } from 'lucide-react'
import { copy, missions } from '../game/el'
import { useGame } from '../game/store'
import { AISLES, ANALEMMA_ANGLE, KOILON_EDGE, SEAT_EDGE, TERRACE_START, TERRACE_WIDTH, DIAZOMA, objectives, rowRadii, type Mission } from '../game/theatre'
import { partStates, useSite, type PartState } from '../game/site'

/*
 * Each part of the theatre gets a small plan of the whole theatre, seen from above with the hill
 * at the top, where only that part is lit. The row of plans shows the building order at a glance.
 */
const SCALE = 1.2
const CX = 16
const CY = 17.5
const at = (radius: number, angle: number) => {
  const r = radius * SCALE
  return `${+(CX + r * Math.sin(angle)).toFixed(2)},${+(CY - r * Math.cos(angle)).toFixed(2)}`
}
const arc = (radius: number, spread: number) => `M${at(radius, -spread)} A${radius * SCALE} ${radius * SCALE} 0 0 1 ${at(radius, spread)}`
const ray = (angle: number, from: number, to: number) => `M${at(from, angle)} L${at(to, angle)}`
const band = TERRACE_WIDTH * SCALE - 0.45
const gate = (x: number) => `M${x - 1.6},21 V17.6 H${x + 1.6} V21`

const shapes: Record<Mission, { d: string; width: number; fill?: boolean }[]> = {
  // The first step builds nothing: activating the plan shows the whole theatre, unlit.
  discover: [],
  orchestra: [{ d: `M${CX - 3.9},${CY} a3.9 3.9 0 1 0 7.8 0 a3.9 3.9 0 1 0 -7.8 0`, width: 1.3 }, { d: `M${CX - 0.9},${CY - 0.9} h1.8 v1.8 h-1.8 z`, width: 0.4, fill: true }],
  analemmata: [-ANALEMMA_ANGLE, ANALEMMA_ANGLE].map((angle) => ({ d: ray(angle, TERRACE_START, KOILON_EDGE), width: 1.5 })),
  seats: rowRadii.slice(0, 2).map((radius) => ({ d: arc(radius, SEAT_EDGE), width: band })),
  diazoma: [{ d: arc(TERRACE_START + TERRACE_WIDTH * (DIAZOMA + 0.5), SEAT_EDGE), width: band }],
  koilon: rowRadii.slice(2).map((radius) => ({ d: arc(radius, SEAT_EDGE), width: band })),
  stairs: AISLES.map((angle) => ({ d: ray(angle, TERRACE_START, KOILON_EDGE - 0.2), width: 1.3 })),
  skene: [{ d: 'M8.5,23.6 h15 v3.8 h-15 z', width: 0.5, fill: true }],
  finish: [{ d: gate(4.6), width: 1.2 }, { d: gate(27.4), width: 1.2 }],
}
const tones: Record<PartState, string> = { done: '#7ad957', active: '#ffd84f', todo: '#a49c8c' }

export function PartPlan({ part, state, size = 30 }: { part: Mission; state: PartState; size?: number }) {
  const lit = tones[state]
  return (
    <svg className="part-plan" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="none" strokeLinecap="butt">
      {objectives.filter(({ id }) => id !== part && id !== 'discover').flatMap(({ id }) => shapes[id]).map(({ d, width, fill }, i) => (
        <path key={i} d={d} stroke="#ffffff30" strokeWidth={width} fill={fill ? '#ffffff30' : 'none'} />
      ))}
      {shapes[part].map(({ d, width, fill }, i) => <path key={`lit${i}`} d={d} stroke={lit} strokeWidth={width} fill={fill ? lit : 'none'} />)}
    </svg>
  )
}

const stateLabel: Record<PartState, string> = { done: copy.partDone, active: copy.partActive, todo: copy.partTodo }

function useParts() {
  const progress = useGame((state) => state.progress)
  const counts = useSite((state) => state.counts)
  return partStates(progress.discovered, progress.completed, counts)
}

/** The row of parts at the top of the screen; finished and active ones open their knowledge text. */
export function PartsBar() {
  const states = useParts()
  const openPart = useGame((state) => state.openPart)
  return (
    <nav className="hud-panel hud-parts" aria-label={copy.parts}>
      {objectives.map(({ id }, index) => {
        const state = states[id]
        const label = `${index + 1}. ${missions[id].title} · ${stateLabel[state]}`
        return (
          <button key={id} className={`part-button ${state}`} aria-label={label} title={label} aria-disabled={state === 'todo'}
            aria-current={state === 'active' ? 'step' : undefined} data-part={id}
            onClick={() => { if (state !== 'todo') openPart(id) }}>
            <PartPlan part={id} state={state} />
          </button>
        )
      })}
    </nav>
  )
}

/** Inside the dialog: where the part sits, its history note and, while it is being built, the task. */
export function PartInfo({ part }: { part: Mission }) {
  const states = useParts()
  const openPart = useGame((state) => state.openPart)
  const congrats = useGame((state) => state.congrats)
  const setPanel = useGame((state) => state.setPanel)
  const reward = objectives.find(({ id }) => id === congrats)?.reward ?? 0
  const open = objectives.map(({ id }) => id).filter((id) => states[id] !== 'todo')
  const index = open.indexOf(part)
  const previous = index > 0 ? open[index - 1] : null
  const next = index >= 0 && index < open.length - 1 ? open[index + 1] : null
  const state = states[part]
  const step = objectives.findIndex(({ id }) => id === part) + 1
  return (
    <div className="part-info">
      {congrats && <>
        <div className="part-congrats" role="status">
          <Award size={22} />
          <p>{copy.congratsDone} «{missions[congrats].title}»{reward > 0 && <strong> +{reward} {copy.points.toLocaleLowerCase('el')}</strong>}</p>
        </div>
        <h3 className="part-next">{copy.nextStep}: {missions[part].title}</h3>
      </>}
      <div className="part-head">
        <span className="part-figure"><PartPlan part={part} state={state} size={84} /></span>
        <div>
          <span className="eyebrow">{copy.parts} · {step}/{objectives.length}</span>
          <span className={`part-state ${state}`}>{stateLabel[state]}</span>
        </div>
      </div>
      <p className="part-note">{missions[part].note}</p>
      {state === 'active' && <div className="part-task"><h3>{copy.partTask}</h3><p>{missions[part].description}</p></div>}
      {congrats && <button className="button primary part-go" onClick={() => setPanel(null)}>{copy.keepBuilding}</button>}
      <div className="part-nav">
        <button className="button" disabled={!previous} onClick={() => previous && openPart(previous)}>
          <ChevronLeft size={17} />{previous ? missions[previous].title : copy.partPrevious}
        </button>
        <button className="button" disabled={!next} onClick={() => next && openPart(next)}>
          {next ? missions[next].title : copy.partNext}<ChevronRight size={17} />
        </button>
      </div>
    </div>
  )
}
