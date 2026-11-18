import { itemByKey, type Stack } from '../game/items'
import { atlasUrl } from '../voxel/atlas'
import { ATLAS_TILES } from '../voxel/mesher'

export function ItemIcon({ item }: { item: string }) {
  const tile = itemByKey.get(item)?.icon ?? 0
  const col = tile % ATLAS_TILES, row = Math.floor(tile / ATLAS_TILES)
  return <span className="block-icon" style={{
    backgroundImage: `url(${atlasUrl()})`, backgroundPosition: `${col / (ATLAS_TILES - 1) * 100}% ${row / (ATLAS_TILES - 1) * 100}%`,
  }} />
}

/** Icon, count and durability bar for a stack (renders nothing for an empty slot). */
export function StackView({ stack }: { stack: Stack | null }) {
  if (!stack) return null
  const tool = itemByKey.get(stack.item)?.tool
  const wear = tool && stack.damage ? 1 - stack.damage / tool.durability : null
  return (
    <>
      <ItemIcon item={stack.item} />
      {stack.count > 1 && <span className="stack-count">{stack.count}</span>}
      {wear !== null && <span className="durability"><span style={{ width: `${wear * 100}%`, background: wear > 0.5 ? '#7bc47f' : wear > 0.2 ? '#e3c25b' : '#d9643f' }} /></span>}
    </>
  )
}
