import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownRight, ArrowRight, BookOpen, CircleHelp, Compass, Hammer, Landmark, MapPin, Settings2 } from 'lucide-react'
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
import { useGame } from './game/store'
import { World } from './world/World'
import { useControls } from './ui/controls'
import { Dialogs } from './ui/Dialogs'
import { StageOverlay } from './ui/Hud'

function App() {
  const { screen, progress, start, setPanel } = useGame()
  const marker = useRef<HTMLDivElement>(null)
  const [blueprint, setBlueprint] = useState(true)
  const game = screen === 'game'
  useControls()
  return (
    <div className={`app-shell ${game ? 'in-game' : 'in-menu'}`}>
      {!game && <header className="masthead">
        <div className="brand">
          <span className="brand-mark"><Landmark size={24} strokeWidth={1.65} /></span>
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
          <div className="menu-actions">
            <button className="button primary start" onClick={start}>{progress.started ? copy.continue : copy.start}<ArrowRight size={20} /></button>
            {progress.started
              ? <button className="button guide" onClick={() => setPanel('new')}>{copy.newGame}</button>
              : <button className="button guide" onClick={() => setPanel('help')}><CircleHelp size={17} />{copy.help}</button>}
          </div>
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

createRoot(document.getElementById('root')!).render(<App />)
