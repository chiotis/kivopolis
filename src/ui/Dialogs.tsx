import { useEffect, useRef, useState } from 'react'
import { Award, Backpack, BookOpen, CircleHelp, Compass, Flame, Hammer, Landmark, Pause, Settings2, X } from 'lucide-react'
import { InventoryScreen } from './InventoryScreen'
import { ModeChoice } from './ModeChoice'
import { copy, missions } from '../game/el'
import { fovRange, sensitivityRange, useGame, type Panel, type Settings } from '../game/store'
import { objectives } from '../game/theatre'
import { complete, earnedPoints, useSite } from '../game/site'

const labels: Record<Panel, string> = {
  settings: copy.settings, help: copy.help, journal: copy.journal, pause: copy.pause, new: copy.newGame,
  reset: copy.reset, complete: copy.badge, inventory: copy.backpack, workshop: copy.workshop, kiln: copy.kiln,
}

const icons = {
  settings: Settings2, help: CircleHelp, journal: BookOpen, pause: Pause, reset: Settings2, new: Compass, complete: Award,
  inventory: Backpack, workshop: Hammer, kiln: Flame,
}

export function Dialogs() {
  const { panel, setPanel, settings, settingsChange, progress, screen, restartMission, goHome, reset, start, setCreative } = useGame()
  const [newCreative, setNewCreative] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const counts = useSite((state) => state.counts)

  useEffect(() => {
    if (panel && ref.current && !ref.current.open) ref.current.showModal()
    else if (!panel && ref.current?.open) ref.current.close()
  }, [panel])

  const Icon = panel ? icons[panel] : Landmark
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
        <h2 id="dialog-title">{labels[panel]}</h2>
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
            {progress.started && <label>{copy.creativeSetting}<input type="checkbox" checked={progress.creative} onChange={(event) => setCreative(event.target.checked)} /></label>}
            {progress.started && <button className="button danger" onClick={() => setPanel('reset')}>{copy.reset}</button>}
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
            {progress.facts.map((id) => <article key={id}><h3>{copy.facts[id].title}</h3><p>{copy.facts[id].text}</p></article>)}
          </div>
        )}
        {(panel === 'inventory' || panel === 'workshop' || panel === 'kiln') && <InventoryScreen kind={panel} />}
        {panel === 'pause' && (
          <div className="modal-actions">
            <button className="button primary" onClick={dismiss}>{copy.resume}</button>
            <button className="button" onClick={restartMission}>{copy.restart}</button>
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
              <Compass size={23} /><div><span className="eyebrow">{copy.nextChapter}</span><h3>{copy.agora}</h3><p>{copy.agoraPreview}</p></div>
            </article>
            <div className="modal-actions"><button className="button primary" onClick={screen === 'game' ? dismiss : goHome}>{copy.returnWorld}</button></div>
          </>
        )}
      </div>}
    </dialog>
  )
}
