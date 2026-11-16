import { useEffect, useRef, useState } from 'react'
import { Award, Backpack, BookOpen, CircleHelp, Compass, Flame, Hammer, Landmark, Lock, Pause, Settings2, Signpost, Users, X } from 'lucide-react'
import { InventoryScreen } from './InventoryScreen'
import { ModeChoice } from './ModeChoice'
import { PartInfo } from './Parts'
import { buildings, copy, missions } from '../game/el'
import { inRoom } from '../game/save'
import { leaveRoom, requestRoom, takeRoomError } from '../net/client'
import { useRoom } from '../net/roomState'
import { NAME_LENGTH, cleanCode, cleanName } from '../net/protocol'
import { BUILDING_ORDER, buildingStatus, previousBuilding, siteProgress } from '../game/buildings'
import { fovRange, sensitivityRange, useGame, useShared, type Panel, type Settings } from '../game/store'
import { objectives } from '../game/theatre'
import { complete, earnedPoints, useSite } from '../game/site'

const labels: Record<Panel, string> = {
  settings: copy.settings, help: copy.help, journal: copy.journal, pause: copy.pause, new: copy.newGame,
  reset: copy.reset, complete: copy.badge, inventory: copy.backpack, workshop: copy.workshop, kiln: copy.kiln, part: copy.parts, building: copy.readSign, room: copy.rooms,
}

const icons = {
  settings: Settings2, help: CircleHelp, journal: BookOpen, pause: Pause, reset: Settings2, new: Compass, complete: Award,
  inventory: Backpack, workshop: Hammer, kiln: Flame, part: BookOpen, building: Signpost, room: Users,
}

export function Dialogs() {
  const { panel, part, building, congrats, setPanel, settings, settingsChange, screen, restartMission, goHome, reset, start, setCreative } = useGame()
  const progress = useShared()
  const host = useRoom((state) => state.me?.host ?? false)
  const [newCreative, setNewCreative] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const counts = useSite((state) => state.counts)

  useEffect(() => {
    if (panel && ref.current && !ref.current.open) ref.current.showModal()
    else if (!panel && ref.current?.open) ref.current.close()
  }, [panel])

  const Icon = panel === 'part' && congrats ? Award : panel ? icons[panel] : Landmark
  const notes = objectives.filter(({ id }) => {
    if (id === 'discover') return progress.discovered
    return progress.celebrated.includes(id) || complete(id, counts)
  })
  const dismiss = () => setPanel(null)

  return (
    <dialog ref={ref} aria-labelledby="dialog-title" className={`modal${panel === 'inventory' || panel === 'workshop' || panel === 'kiln' ? ' wide' : ''}`} onCancel={(event) => { event.preventDefault(); dismiss() }}
      onClick={(event) => { if (event.target === event.currentTarget) dismiss() }}>
      {panel && <div className="modal-content">
        <div className="modal-header">
          <span className="modal-symbol"><Icon size={23} /></span>
          <button className="icon-button" aria-label={copy.close} onClick={dismiss}><X size={19} /></button>
        </div>
        <h2 id="dialog-title">{panel === 'part' && part ? (congrats ? copy.congrats : missions[part].title) : panel === 'building' && building ? buildings[building].title : labels[panel]}</h2>
        {panel === 'settings' && (
          <div className="settings-list">
            <label>{copy.quality}
              <select value={settings.quality} onChange={(event) => settingsChange({ quality: event.target.value as Settings['quality'] })}>
                <option value="auto">{copy.auto}</option><option value="high">{copy.high}</option><option value="low">{copy.low}</option>
              </select>
            </label>
            <label>{copy.sound}<input type="checkbox" checked={settings.sound} onChange={(event) => settingsChange({ sound: event.target.checked })} /></label>
            <label>{copy.reducedMotion}<input type="checkbox" checked={settings.reducedMotion} onChange={(event) => settingsChange({ reducedMotion: event.target.checked })} /></label>
            <label>{copy.dayCycle}<input type="checkbox" checked={settings.dayCycle} onChange={(event) => settingsChange({ dayCycle: event.target.checked })} /></label>
            <label>{copy.fov}<span className="setting-range">
              <input type="range" min={fovRange[0]} max={fovRange[1]} step={1} value={settings.fov}
                onChange={(event) => settingsChange({ fov: Number(event.target.value) })} />
              <output>{settings.fov}°</output></span></label>
            <label>{copy.sensitivity}<span className="setting-range">
              <input type="range" min={sensitivityRange[0]} max={sensitivityRange[1]} step={0.05} value={settings.sensitivity}
                onChange={(event) => settingsChange({ sensitivity: Number(event.target.value) })} />
              <output>{settings.sensitivity.toLocaleString('el', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×</output></span></label>
            <label>{copy.invertY}<input type="checkbox" checked={settings.invertY} onChange={(event) => settingsChange({ invertY: event.target.checked })} /></label>
            {progress.started && (!inRoom() || host) && <label>{copy.creativeSetting}<input type="checkbox" checked={progress.creative} onChange={(event) => setCreative(event.target.checked)} /></label>}
            {progress.started && !inRoom() && <button className="button danger" onClick={() => setPanel('reset')}>{copy.reset}</button>}
          </div>
        )}
        {panel === 'help' && (
          <div className="help-list">
            {copy.inputHelp.map(([input, hint]) => <div key={input}><strong>{input}</strong><p>{hint}</p></div>)}
            <p>{copy.orbit} · {copy.pan} · {copy.zoom}</p>
          </div>
        )}
        {panel === 'journal' && (
          <div className="journal-list">
            {!notes.length && !progress.facts.length && <p>{copy.journalEmpty}</p>}
            {notes.map(({ id }) => <article key={id}><h3>{missions[id].title}</h3><p>{missions[id].note}</p></article>)}
            {BUILDING_ORDER.some((id) => id !== 'theatre' && siteProgress(progress, id).discovered) && <h3 className="journal-heading">{copy.buildingsJournal}</h3>}
            {BUILDING_ORDER.filter((id) => id !== 'theatre' && siteProgress(progress, id).discovered).map((id) =>
              <article key={id}><h3>{buildings[id].title}</h3><p>{buildings[id].intro}</p></article>)}
            {progress.facts.map((id) => <article key={id}><h3>{copy.facts[id].title}</h3><p>{copy.facts[id].text}</p></article>)}
          </div>
        )}
        {panel === 'part' && part && <PartInfo part={part} />}
        {panel === 'building' && building && <BuildingSign id={building} />}
        {panel === 'room' && <RoomForm />}
        {(panel === 'inventory' || panel === 'workshop' || panel === 'kiln') && <InventoryScreen kind={panel} />}
        {panel === 'pause' && (
          <div className="modal-actions">
            <button className="button primary" onClick={dismiss}>{copy.resume}</button>
            {(!inRoom() || host) && <button className="button" onClick={restartMission}>{copy.restart}</button>}
            {inRoom() && <button className="button" onClick={leaveRoom}>{copy.leaveRoom}</button>}
            <button className="button" onClick={() => setPanel('settings')}>{copy.settings}</button>
            <button className="button" onClick={goHome}>{copy.home}</button>
          </div>
        )}
        {(panel === 'reset' || panel === 'new') && (
          <>
            <p>{panel === 'new' ? copy.newGamePrompt : copy.resetPrompt}</p>
            {panel === 'new' && <ModeChoice creative={newCreative} onChange={setNewCreative} />}
            <div className="modal-actions">
              <button className="button danger" onClick={() => { reset(); if (panel === 'new') { setCreative(newCreative); start() } }}>
                {panel === 'new' ? copy.newGame : copy.confirmReset}
              </button>
              <button className="button" onClick={panel === 'new' ? dismiss : () => setPanel('settings')}>{copy.cancel}</button>
            </div>
          </>
        )}
        {panel === 'complete' && (
          <>
            <p className="completion-message">{copy.finishTitle}</p>
            <p className="badge-score"><Award size={17} /> {earnedPoints(progress.discovered, counts, progress.completed)} {copy.points.toLocaleLowerCase('el')}</p>
            <article className="agora">
              <Compass size={23} /><div><span className="eyebrow">{copy.nextChapter}</span><h3>{buildings.sanctuary.title}</h3><p>{copy.nextBuilding}</p></div>
            </article>
            <div className="modal-actions"><button className="button primary" onClick={screen === 'game' ? dismiss : goHome}>{copy.returnWorld}</button></div>
          </>
        )}
      </div>}
    </dialog>
  )
}

/** What a new area's signpost says: the story of the building, and whether it is open yet. */
function BuildingSign({ id }: { id: (typeof BUILDING_ORDER)[number] }) {
  const progress = useShared()
  const status = buildingStatus(progress, id)
  return (
    <>
      <p>{buildings[id].intro}</p>
      <p className={`building-status ${status}`}>
        {status === 'locked' && <><Lock size={15} />{copy.buildingLocked(buildings[previousBuilding(id)].title.toLocaleLowerCase('el'))}</>}
        {status === 'coming' && copy.buildingComing}
      </p>
    </>
  )
}

/** Create a room, or join one with its code, under a nickname. The last failed attempt says why. */
function RoomForm() {
  const [error] = useState(() => takeRoomError())
  const [create, setCreate] = useState(true)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const tidyName = cleanName(name), tidyCode = cleanCode(code)
  const ready = Boolean(tidyName && (create || tidyCode))
  const go = () => {
    if (!tidyName) return
    requestRoom(create ? { create: true, name: tidyName } : { create: false, code: tidyCode!, name: tidyName })
  }
  return (
    <form className="room-form" onSubmit={(event) => { event.preventDefault(); if (ready) go() }}>
      <p>{copy.roomHint}</p>
      {error && <p className="building-status locked" role="alert">{copy.roomErrors[error] ?? copy.roomErrors['bad-message']}</p>}
      <div className="room-tabs" role="radiogroup">
        <button type="button" role="radio" aria-checked={create} className={`button${create ? ' primary' : ''}`} onClick={() => setCreate(true)}>{copy.createRoom}</button>
        <button type="button" role="radio" aria-checked={!create} className={`button${!create ? ' primary' : ''}`} onClick={() => setCreate(false)}>{copy.joinRoom}</button>
      </div>
      <label>{copy.nickname}<input value={name} maxLength={NAME_LENGTH} autoComplete="off" onChange={(event) => setName(event.target.value)} /></label>
      {!create && <label>{copy.roomCode}<input value={code} maxLength={6} autoComplete="off" className="room-code"
        onChange={(event) => setCode(event.target.value.toUpperCase())} /></label>}
      <p className="room-privacy">{copy.roomPrivacy}</p>
      <div className="modal-actions"><button type="submit" className="button primary" disabled={!ready}>{create ? copy.roomCreateGo : copy.roomJoinGo}</button></div>
    </form>
  )
}
