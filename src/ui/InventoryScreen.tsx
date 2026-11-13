import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { ArrowRight, Flame } from 'lucide-react'
import { copy, itemName } from '../game/el'
import { HOTBAR, inventory, SLOTS, useInventory, type Area } from '../game/inventory'
import { recipes, type Recipe } from '../game/recipes'
import { items } from '../game/items'
import { useGame } from '../game/store'
import { ItemIcon, StackView } from './ItemIcon'

function Slot({ area, index, label }: { area: Area; index: number; label?: string }) {
  const stack = useInventory((state) => {
    if (area === 'inv') return state.slots[index]
    if (area === 'craft') return state.craft[index]
    const kiln = state.openKiln ? state.kilns[state.openKiln] : null
    return area === 'kilnInput' ? kiln?.input ?? null : area === 'kilnFuel' ? kiln?.fuel ?? null : kiln?.output ?? null
  })
  const name = stack ? `${itemName(stack.item)}${stack.count > 1 ? ` × ${stack.count}` : ''}` : copy.emptyHand
  const click = (button: 'left' | 'right') => (event: MouseEvent) => {
    event.preventDefault()
    inventory.click({ area, index }, button, event.shiftKey)
  }
  return (
    <button className="inv-slot" data-testid={`slot-${area}-${index}`} aria-label={label ? `${label}: ${name}` : name} title={stack ? itemName(stack.item) : label}
      onClick={click('left')} onContextMenu={click('right')}>
      <StackView stack={stack} />
    </button>
  )
}

function ResultSlot() {
  const craft = useInventory((state) => state.craft)
  const craftSize = useInventory((state) => state.craftSize)
  const result = useMemo(() => inventory.result({ ...useInventory.getState(), craft, craftSize }), [craft, craftSize])
  return (
    <button className="inv-slot result" data-testid="slot-result" aria-label={`${copy.craftResult}: ${result ? itemName(result.item) : '—'}`}
      title={result ? itemName(result.item) : copy.craftResult} onClick={(event) => inventory.craft(event.shiftKey)}>
      <StackView stack={result} />
    </button>
  )
}

function Crafting({ size }: { size: 2 | 3 }) {
  return (
    <div className="crafting">
      <div className="craft-grid" style={{ gridTemplateColumns: `repeat(${size}, auto)` }} role="group" aria-label={copy.crafting}>
        {Array.from({ length: size * size }, (_, index) => <Slot key={index} area="craft" index={index} />)}
      </div>
      <ArrowRight size={22} className="craft-arrow" />
      <ResultSlot />
    </div>
  )
}

function KilnPanel() {
  const kiln = useInventory((state) => (state.openKiln ? state.kilns[state.openKiln] : null))
  const burning = kiln && kiln.burnMax ? kiln.burn / kiln.burnMax : 0
  return (
    <div className="crafting kiln">
      <div className="kiln-column">
        <Slot area="kilnInput" index={0} label={copy.kilnInput} />
        <Flame size={20} className="kiln-flame" style={{ opacity: 0.25 + burning * 0.75 }} aria-hidden="true" />
        <Slot area="kilnFuel" index={0} label={copy.kilnFuel} />
      </div>
      <div className="kiln-progress" role="progressbar" aria-label={copy.kilnOutput} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((kiln?.progress ?? 0) * 100)}>
        <span style={{ width: `${(kiln?.progress ?? 0) * 100}%` }} />
      </div>
      <Slot area="kilnOutput" index={0} label={copy.kilnOutput} />
    </div>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const cells = recipe.pattern
    ? recipe.pattern.flatMap((row) => [...row].map((symbol) => (symbol === ' ' ? null : recipe.keys![symbol])))
    : recipe.ingredients!
  const width = recipe.pattern ? recipe.pattern[0].length : Math.min(2, cells.length)
  return (
    <li title={itemName(recipe.result.item)}>
      <span className="recipe-grid" style={{ gridTemplateColumns: `repeat(${width}, 14px)` }}>
        {cells.map((cell, i) => <span key={i} className="recipe-cell">{cell && <ItemIcon item={cell} />}</span>)}
      </span>
      <ArrowRight size={11} />
      <span className="recipe-cell result"><ItemIcon item={recipe.result.item} /></span>
      <span className="recipe-name">{itemName(recipe.result.item)}{recipe.result.count > 1 ? ` × ${recipe.result.count}` : ''}</span>
    </li>
  )
}

function fits(recipe: Recipe, size: number) {
  if (recipe.ingredients) return recipe.ingredients.length <= size * size
  return recipe.pattern!.length <= size && recipe.pattern![0].length <= size
}

/** Every item in the game, one click away, for creative play. */
function Palette() {
  return (
    <div className="palette" role="group" aria-label={copy.palette}>
      <p className="palette-title">{copy.palette}</p>
      <div className="inv-grid palette-grid">
        {items.map(({ key }) => (
          <button key={key} className="inv-slot" aria-label={itemName(key)} title={itemName(key)}
            onClick={(event) => { event.preventDefault(); inventory.palette(key, event.shiftKey) }}
            onContextMenu={(event) => { event.preventDefault(); inventory.palette(null) }}>
            <ItemIcon item={key} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function InventoryScreen({ kind }: { kind: 'inventory' | 'workshop' | 'kiln' }) {
  const cursor = useInventory((state) => state.cursor)
  const craftSize = useInventory((state) => state.craftSize)
  const creative = useGame((state) => state.progress.creative)
  const carried = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (carried.current) carried.current.style.transform = `translate(${event.clientX + 6}px, ${event.clientY + 6}px)`
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  const known = kind === 'kiln' ? [] : recipes.filter((recipe) => fits(recipe, craftSize))
  return (
    <div className="inventory-screen">
      {creative && kind === 'inventory' ? <Palette /> : kind === 'kiln' ? <KilnPanel /> : <Crafting size={craftSize} />}
      <div className="inv-grid main" role="group" aria-label={copy.backpack}>
        {Array.from({ length: SLOTS - HOTBAR }, (_, i) => <Slot key={i} area="inv" index={HOTBAR + i} />)}
      </div>
      <div className="inv-grid hotbar-row" role="group" aria-label={copy.hotbar}>
        {Array.from({ length: HOTBAR }, (_, i) => <Slot key={i} area="inv" index={i} />)}
      </div>
      <p className="inventory-hint">{copy.inventoryHint}</p>
      {known.length > 0 && !(creative && kind === 'inventory') && <details className="recipe-book">
        <summary>{copy.recipes}</summary>
        {kind === 'inventory' && <p>{copy.recipesWorkshop}</p>}
        <ul>{known.map((recipe, i) => <RecipeCard key={i} recipe={recipe} />)}</ul>
      </details>}
      <div ref={carried} className="carried" aria-hidden="true">{cursor && <span className="inv-slot ghost"><StackView stack={cursor} /></span>}</div>
    </div>
  )
}
