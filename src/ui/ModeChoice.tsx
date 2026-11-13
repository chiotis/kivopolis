import { Hammer, Pickaxe } from 'lucide-react'
import { copy } from '../game/el'

/** Picks between gathering materials and creative building for a new game. */
export function ModeChoice({ creative, onChange }: { creative: boolean; onChange: (creative: boolean) => void }) {
  const options = [
    { value: false, title: copy.modeGather, hint: copy.modeGatherHint, Icon: Pickaxe },
    { value: true, title: copy.modeCreative, hint: copy.modeCreativeHint, Icon: Hammer },
  ]
  return (
    <fieldset className="mode-choice">
      <legend>{copy.modeTitle}</legend>
      {options.map(({ value, title, hint, Icon }) => (
        <label key={title} className={creative === value ? 'chosen' : ''}>
          <input type="radio" name="game-mode" checked={creative === value} onChange={() => onChange(value)} />
          <Icon size={18} />
          <span><strong>{title}</strong><small>{hint}</small></span>
        </label>
      ))}
    </fieldset>
  )
}
