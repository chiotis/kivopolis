import { Hammer, HeartPulse, Pickaxe } from 'lucide-react'
import { copy } from '../game/el'
import type { GameMode } from '../game/survival'

/** Picks how a new game is played: gathering materials, survival, or creative building. */
export function ModeChoice({ mode, onChange }: { mode: GameMode; onChange: (mode: GameMode) => void }) {
  const options = [
    { value: 'gather' as const, title: copy.modeGather, hint: copy.modeGatherHint, Icon: Pickaxe },
    { value: 'survival' as const, title: copy.modeSurvival, hint: copy.modeSurvivalHint, Icon: HeartPulse },
    { value: 'creative' as const, title: copy.modeCreative, hint: copy.modeCreativeHint, Icon: Hammer },
  ]
  return (
    <fieldset className="mode-choice">
      <legend>{copy.modeTitle}</legend>
      {options.map(({ value, title, hint, Icon }) => (
        <label key={value} className={mode === value ? 'chosen' : ''}>
          <input type="radio" name="game-mode" checked={mode === value} onChange={() => onChange(value)} />
          <Icon size={18} />
          <span><strong>{title}</strong><small>{hint}</small></span>
        </label>
      ))}
    </fieldset>
  )
}
