import { blocks, isFlowing, type BlockDef, type ToolType } from '../voxel/blocks'

/** Atlas tiles for items that are not blocks (drawn in voxel/atlas.ts). */
export const ItemTile = {
  stick: 32, clayLump: 33, copperIngot: 34, tinIngot: 35, bronzeIngot: 36,
  woodPickaxe: 37, stonePickaxe: 38, bronzePickaxe: 39,
  woodAxe: 40, stoneAxe: 41, bronzeAxe: 42,
  woodShovel: 43, stoneShovel: 44, bronzeShovel: 45,
  milk: 46, feather: 47, hydria: 48, hydriaFull: 49,
} as const

export interface Tool { type: ToolType; tier: 1 | 2 | 3; speed: number; durability: number }
export interface ItemDef {
  key: string
  /** Set for items that place a block. */
  block?: number
  /** Atlas tile used for the icon (a block's side tile for block items). */
  icon: number
  maxStack: number
  tool?: Tool
}
export interface Stack { item: string; count: number; damage?: number }

const tiers = [
  { name: 'wood', tier: 1, speed: 2, durability: 60 },
  { name: 'stone', tier: 2, speed: 4, durability: 132 },
  { name: 'bronze', tier: 3, speed: 6.5, durability: 250 },
] as const
const toolTypes: ToolType[] = ['pickaxe', 'axe', 'shovel']

const placeable = blocks.filter((def) => def.key !== 'air' && def.key !== 'bedrock' && !isFlowing(def.id))

export const items: ItemDef[] = [
  ...placeable.map((def): ItemDef => ({ key: def.key, block: def.id, icon: def.tiles.side, maxStack: 64 })),
  ...(['stick', 'clayLump', 'copperIngot', 'tinIngot', 'bronzeIngot', 'milk', 'feather'] as const)
    .map((key): ItemDef => ({ key, icon: ItemTile[key], maxStack: 64 })),
  // The hydria carries one load of water: empty, or full.
  ...(['hydria', 'hydriaFull'] as const).map((key): ItemDef => ({ key, icon: ItemTile[key], maxStack: 1 })),
  ...tiers.flatMap(({ name, tier, speed, durability }) => toolTypes.map((type): ItemDef => {
    const key = `${name}${type[0].toUpperCase()}${type.slice(1)}` as keyof typeof ItemTile
    return { key, icon: ItemTile[key], maxStack: 1, tool: { type, tier, speed, durability } }
  })),
]
export const itemByKey = new Map(items.map((item) => [item.key, item]))
export const item = (key: string) => itemByKey.get(key)
export const maxStack = (key: string) => itemByKey.get(key)?.maxStack ?? 64

/** Fuel burn time in seconds. */
export const fuel: Record<string, number> = { oliveLog: 15, planks: 7.5, stick: 2.5, workshop: 7.5 }
/** Kiln recipes: input item → output item. */
export const smelting: Record<string, string> = {
  clay: 'terracotta', copperOre: 'copperIngot', tinOre: 'tinIngot',
}
export const SMELT_TIME = 4

export interface Mining {
  /** Seconds to break. */
  time: number
  /** Whether the block drops anything with this tool. */
  harvest: boolean
}

/** Breaking speed rules: the right tool divides the time; a missing required tool triples it and drops nothing. */
export function mining(def: BlockDef, held?: Stack | null): Mining {
  const tool = held ? itemByKey.get(held.item)?.tool : undefined
  const effective = Boolean(tool && def.tool === tool.type)
  const harvest = def.tier === 0 || (effective && tool!.tier >= def.tier)
  let time = def.hardness
  if (effective) time /= tool!.speed
  if (!harvest) time *= 3.3
  return { time, harvest }
}

/** What a broken block drops, after rolling its chance. */
export function rollDrop(def: BlockDef, random = Math.random): Stack | null {
  if (def.drop === null) return null
  const drop = def.drop ?? { item: def.key, count: 1 }
  if (drop.chance !== undefined && random() >= drop.chance) return null
  return { item: drop.item, count: drop.count }
}
