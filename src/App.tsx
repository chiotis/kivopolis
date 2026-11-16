/// <reference types="vite/client" />
// Imported by main.tsx only after the save has been read, because the stores load from it.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownRight, ArrowRight, BookOpen, CircleHelp, Compass, Hammer, Landmark, LogOut, MapPin, Settings2, Users } from 'lucide-react'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import '@fontsource/manrope/greek-400.css'
import '@fontsource/manrope/greek-600.css'
import '@fontsource/manrope/greek-700.css'
import '@fontsource/manrope/greek-800.css'
import '@fontsource/noto-serif/greek-500.css'
import '@fontsource/noto-serif/greek-500-italic.css'
import '@fontsource/tiny5/latin-400.css'
import '@fontsource/tiny5/greek-400.css'
import './style.css'
import { copy } from './game/el'
import { useGame, useShared } from './game/store'
import { World } from './world/World'
import { inRoom } from './game/save'
import { ROOM_SERVER, hasRoomError, leaveRoom } from './net/client'
import { useRoom } from './net/roomState'
import { useControls } from './ui/controls'
import { Dialogs } from './ui/Dialogs'
import { StageOverlay } from './ui/Hud'
import { ModeChoice } from './ui/ModeChoice'
import { Logo } from './ui/Logo'

function App() {
  const { screen, start, setPanel } = useGame()
  const progress = useShared()
  const marker = useRef<HTMLDivElement>(null)
  const [blueprint, setBlueprint] = useState(true)
  const [creative, setCreative] = useState(false)
  const game = screen === 'game'
  const roomCode = useRoom((state) => state.code)
  useControls()
  // A room that could not be joined: open the room window, which says why.
  useEffect(() => { if (hasRoomError()) setPanel('room') }, [setPanel])
  return (
    <div className={`app-shell ${game ? 'in-game' : 'in-menu'}`}>
      {!game && <header className="masthead">
        <div className="brand">
          <span className="brand-mark"><Logo size={30} /></span>
          <span className="brand-text"><strong>{copy.brand}</strong><span>{copy.valley}</span></span>
        </div>
        <nav className="top-nav">
          <button className="nav-button" onClick={() => setPanel('help')} aria-label={copy.help}><CircleHelp size={18} /><span>{copy.help}</span></button>
          <button className="icon-button" onClick={() => setPanel('settings')} aria-label={copy.settings} title={copy.settings}><Settings2 size={19} /></button>
        </nav>
      </header>}
      <main className={`experience ${game ? 'playing' : 'landing'}`}>
        {!game && <section className="intro">
          <div className="chapter-label"><span />{copy.chapter}<span className="chapter-divider" />{copy.valley}</div>
          <h1>{copy.title[0]}<em>{copy.title[1]}</em></h1>
          <p className="tagline">{copy.tagline}</p>
          <p className="intro-description">{copy.intro}</p>
          {!progress.started && !inRoom() && <ModeChoice creative={creative} onChange={setCreative} />}
          {inRoom() && <p className="room-banner"><Users size={16} />{copy.inRoom} <strong className="pixel">{roomCode}</strong></p>}
          <div className="menu-actions">
            <button className="button primary start" onClick={() => { if (!progress.started) useGame.getState().setCreative(creative); start() }}>{progress.started ? copy.continue : copy.start}<ArrowRight size={20} /></button>
            {inRoom()
              ? <button className="button guide" onClick={leaveRoom}><LogOut size={17} />{copy.leaveRoom}</button>
              : progress.started
              ? <button className="button guide" onClick={() => setPanel('new')}>{copy.newGame}</button>
              : <button className="button guide" onClick={() => setPanel('help')}><CircleHelp size={17} />{copy.help}</button>}
          </div>
          {ROOM_SERVER && !inRoom() && <button className="button guide room-button" onClick={() => setPanel('room')}><Users size={17} />{copy.rooms}</button>}
          <div className="intro-foot"><span className="foot-mark">Α</span><p>{copy.disclaimer}</p></div>
        </section>}
        <section className="stage" aria-label={copy.valley}>
          <World blueprint={blueprint} marker={marker} />
          {game ? <StageOverlay blueprint={blueprint} setBlueprint={setBlueprint} marker={marker} /> : (
            <div className="stage-overlay menu-overlay">
              <div className="stage-top">
                <div className="chapter-pin"><MapPin size={15} /><span>{copy.site}</span></div>
                <div className="compass"><span>{copy.compass}</span><Compass size={22} strokeWidth={1.35} /></div>
              </div>
              <div className="menu-location">
                <div className="location-icon"><Landmark size={24} strokeWidth={1.55} /></div>
                <div><span className="eyebrow">{copy.location}</span><strong>{copy.valley}</strong></div>
                <ArrowDownRight className="location-arrow" size={20} />
              </div>
            </div>
          )}
        </section>
      </main>
      {!game && <footer className="menu-footer">
        <div className="footer-features">
          <span><Compass size={17} />{copy.explore}</span><span><Hammer size={16} />{copy.build}</span><span><BookOpen size={17} />{copy.journal}</span>
        </div>
        <span className="footer-language">{copy.locale}</span>
      </footer>}
      <Dialogs />
    </div>
  )
}

export function mount() {
  createRoot(document.getElementById('root')!).render(<App />)
}

// Development only: lets browser tests read live player, animal and item state, and act as a player would.
if (import.meta.env.DEV) {
  void Promise.all([import('./world/player'), import('./world/herd'), import('./world/dropState'), import('./game/actions'), import('./game/inventory')])
    .then(([player, herd, dropState, actions, inventory]) => {
      Object.assign(window, { __polis: { player: player.playerState, herd: herd.herd, drops: dropState.drops, apply: actions.apply, inventory: inventory.useInventory } })
    })
}
