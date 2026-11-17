// Block registry. Ids are stored as bytes in the world grid, so keep them stable:
// saved worlds refer to these numbers.
export const Block = {
  air: 0,
  grass: 1,
  soil: 2,
  sand: 3,
  limestone: 4,
  marble: 5,
  clay: 6,
  terracotta: 7,
  oliveLog: 8,
  oliveLeaves: 9,
  cypressLeaves: 10,
  gravel: 11,
  ashlar: 12,
  planks: 13,
  path: 14,
  bedrock: 15,
  workshop: 16,
  kiln: 17,
  copperOre: 18,
  tinOre: 19,
  lamp: 20,
  wool: 21,
  water: 22,
  // Flowing water, weakest to strongest: each step from a source loses one level.
  flow1: 23,
  flow2: 24,
  flow3: 25,
  flow4: 26,
  flow5: 27,
  flow6: 28,
  flow7: 29,
  // The temple of Dionysus (Phase 13): carved marble parts and bronze.
  columnDrum: 30,
  capital: 31,
  triglyph: 32,
  metope: 33,
  statueBase: 34,
  bronze: 35,
  // The agora (Phase 14): the fountain house's water, and the market.
  lionSpout: 36,
  pipe: 37,
  pithos: 38,
  amphora: 39,
  stall: 40,
} as const
export type BlockId = (typeof Block)[keyof typeof Block]

// Atlas tile indices (8 x 8 grid of 16 px tiles, drawn in atlas.ts).
export const Tile = {
  grassTop: 0, grassSide: 1, soil: 2, sand: 3, limestone: 4, marble: 5, clay: 6, terracotta: 7,
  logSide: 8, logTop: 9, oliveLeaves: 10, cypressLeaves: 11, gravel: 12, ashlar: 13, planks: 14, path: 15,
  bedrock: 16, pathSide: 17, workshopTop: 18, workshopSide: 19, kilnSide: 20, kilnTop: 21,
  copperOre: 22, tinOre: 23, lampSide: 24, lampTop: 25, wool: 26,
  drumSide: 27, drumTop: 28, capitalSide: 29, capitalTop: 30, triglyph: 31,
  // Tiles 32–49 are item icons (items.ts); the temple carries on after them.
  metope: 50, statueBase: 51, bronze: 52,
  lionSpout: 53, pipeSide: 54, pipeEnd: 55, pithosSide: 56, pithosTop: 57, amphoraSide: 58, amphoraTop: 59, stallSide: 60, stallTop: 61,
} as const

export type ToolType = 'pickaxe' | 'axe' | 'shovel'
/** What a block gives when broken: an item key, how many, and a chance (default 1). */
export interface Drop { item: string; count: number; chance?: number }

export interface BlockDef {
  id: BlockId
  key: keyof typeof Block
  /** Seconds to break by hand. Infinity cannot be broken. */
  hardness: number
  /** Leaves are cut-out: faces behind them still render. */
  opaque: boolean
  solid: boolean
  tiles: { top: number; side: number; bottom: number }
  /** Representative color for break particles. */
  color: string
  sound: 'soft' | 'stone' | 'wood' | 'leaves'
  /** The tool that breaks it faster. */
  tool?: ToolType
  /** Minimum tool tier needed to get a drop: 0 hand, 1 wood, 2 stone, 3 bronze. */
  tier: number
  /** Defaults to one of the block itself; null drops nothing. */
  drop?: Drop | null
  /** Block light it gives off (0–15), spreading one level per block. */
  light?: number
}

const all = (tile: number) => ({ top: tile, side: tile, bottom: tile })

const defs: Omit<BlockDef, 'id'>[] = [
  { key: 'air', hardness: 0, opaque: false, solid: false, tiles: all(0), color: '#000', sound: 'soft', tier: 0, drop: null },
  { key: 'grass', hardness: 0.45, opaque: true, solid: true, tiles: { top: Tile.grassTop, side: Tile.grassSide, bottom: Tile.soil }, color: '#93a26f', sound: 'soft', tool: 'shovel', tier: 0, drop: { item: 'soil', count: 1 } },
  { key: 'soil', hardness: 0.4, opaque: true, solid: true, tiles: all(Tile.soil), color: '#9a7652', sound: 'soft', tool: 'shovel', tier: 0 },
  { key: 'sand', hardness: 0.35, opaque: true, solid: true, tiles: all(Tile.sand), color: '#e2cd9f', sound: 'soft', tool: 'shovel', tier: 0 },
  { key: 'limestone', hardness: 1.1, opaque: true, solid: true, tiles: all(Tile.limestone), color: '#cdb995', sound: 'stone', tool: 'pickaxe', tier: 1 },
  { key: 'marble', hardness: 1.4, opaque: true, solid: true, tiles: all(Tile.marble), color: '#efe9dc', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'clay', hardness: 0.45, opaque: true, solid: true, tiles: all(Tile.clay), color: '#b98466', sound: 'soft', tool: 'shovel', tier: 0, drop: { item: 'clayLump', count: 4 } },
  { key: 'terracotta', hardness: 0.9, opaque: true, solid: true, tiles: all(Tile.terracotta), color: '#c06c48', sound: 'stone', tool: 'pickaxe', tier: 1 },
  { key: 'oliveLog', hardness: 0.9, opaque: true, solid: true, tiles: { top: Tile.logTop, side: Tile.logSide, bottom: Tile.logTop }, color: '#76583f', sound: 'wood', tool: 'axe', tier: 0 },
  { key: 'oliveLeaves', hardness: 0.15, opaque: false, solid: true, tiles: all(Tile.oliveLeaves), color: '#7d8a59', sound: 'leaves', tier: 0, drop: { item: 'stick', count: 1, chance: 0.12 } },
  { key: 'cypressLeaves', hardness: 0.15, opaque: false, solid: true, tiles: all(Tile.cypressLeaves), color: '#3f6448', sound: 'leaves', tier: 0, drop: { item: 'stick', count: 1, chance: 0.12 } },
  { key: 'gravel', hardness: 0.5, opaque: true, solid: true, tiles: all(Tile.gravel), color: '#a49a88', sound: 'soft', tool: 'shovel', tier: 0 },
  { key: 'ashlar', hardness: 1.2, opaque: true, solid: true, tiles: all(Tile.ashlar), color: '#dcc49c', sound: 'stone', tool: 'pickaxe', tier: 1 },
  { key: 'planks', hardness: 0.7, opaque: true, solid: true, tiles: all(Tile.planks), color: '#a87a51', sound: 'wood', tool: 'axe', tier: 0 },
  { key: 'path', hardness: 0.4, opaque: true, solid: true, tiles: { top: Tile.path, side: Tile.pathSide, bottom: Tile.soil }, color: '#cfb888', sound: 'soft', tool: 'shovel', tier: 0, drop: { item: 'soil', count: 1 } },
  { key: 'bedrock', hardness: Infinity, opaque: true, solid: true, tiles: all(Tile.bedrock), color: '#6d685f', sound: 'stone', tier: 9, drop: null },
  { key: 'workshop', hardness: 0.9, opaque: true, solid: true, tiles: { top: Tile.workshopTop, side: Tile.workshopSide, bottom: Tile.planks }, color: '#a87a51', sound: 'wood', tool: 'axe', tier: 0 },
  { key: 'kiln', hardness: 1.3, opaque: true, solid: true, tiles: { top: Tile.kilnTop, side: Tile.kilnSide, bottom: Tile.limestone }, color: '#a49276', sound: 'stone', tool: 'pickaxe', tier: 1 },
  { key: 'copperOre', hardness: 1.5, opaque: true, solid: true, tiles: all(Tile.copperOre), color: '#c4743a', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'tinOre', hardness: 1.5, opaque: true, solid: true, tiles: all(Tile.tinOre), color: '#9fb0bd', sound: 'stone', tool: 'pickaxe', tier: 2 },
  // An oil lamp on a bronze stand: drawn as a cut-out, walked through, and it lights its surroundings.
  { key: 'lamp', hardness: 0.1, opaque: false, solid: false, tiles: { top: Tile.lampTop, side: Tile.lampSide, bottom: Tile.lampTop }, color: '#c98a3c', sound: 'stone', tier: 0, light: 14 },
  { key: 'wool', hardness: 0.35, opaque: true, solid: true, tiles: all(Tile.wool), color: '#ece6d6', sound: 'soft', tier: 0 },
  // Sea water: drawn in its own see-through mesh, swum through, never mined.
  { key: 'water', hardness: Infinity, opaque: false, solid: false, tiles: all(0), color: '#4f93a0', sound: 'soft', tier: 9, drop: null },
  // Flowing water (see flow.ts): the same see-through water, never placed or mined by hand.
  ...([1, 2, 3, 4, 5, 6, 7] as const).map((level) => ({
    key: `flow${level}` as const, hardness: Infinity, opaque: false, solid: false, tiles: all(0), color: '#4f93a0', sound: 'soft' as const, tier: 9, drop: null,
  })),
  // The temple (Phase 13): marble carved at the workshop, and bronze for the cult statue.
  { key: 'columnDrum', hardness: 1.4, opaque: true, solid: true, tiles: { top: Tile.drumTop, side: Tile.drumSide, bottom: Tile.drumTop }, color: '#ebe4d5', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'capital', hardness: 1.4, opaque: true, solid: true, tiles: { top: Tile.capitalTop, side: Tile.capitalSide, bottom: Tile.drumTop }, color: '#ebe4d5', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'triglyph', hardness: 1.4, opaque: true, solid: true, tiles: { top: Tile.marble, side: Tile.triglyph, bottom: Tile.marble }, color: '#3d4e6b', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'metope', hardness: 1.4, opaque: true, solid: true, tiles: { top: Tile.marble, side: Tile.metope, bottom: Tile.marble }, color: '#efe9dc', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'statueBase', hardness: 1.4, opaque: true, solid: true, tiles: { top: Tile.marble, side: Tile.statueBase, bottom: Tile.marble }, color: '#e6decd', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'bronze', hardness: 1.6, opaque: true, solid: true, tiles: all(Tile.bronze), color: '#a07a45', sound: 'stone', tool: 'pickaxe', tier: 2 },
  // The agora (Phase 14). The spout and the pipe carry water to the fountain house (14c); the jars
  // and the stall furnish the market. The jars are cut-outs, like the lamp, and stand solid.
  { key: 'lionSpout', hardness: 1.4, opaque: true, solid: true, tiles: { top: Tile.marble, side: Tile.lionSpout, bottom: Tile.marble }, color: '#e9e2d3', sound: 'stone', tool: 'pickaxe', tier: 2 },
  { key: 'pipe', hardness: 0.9, opaque: true, solid: true, tiles: { top: Tile.pipeSide, side: Tile.pipeSide, bottom: Tile.pipeEnd }, color: '#b8643f', sound: 'stone', tool: 'pickaxe', tier: 1 },
  { key: 'pithos', hardness: 0.9, opaque: false, solid: true, tiles: { top: Tile.pithosTop, side: Tile.pithosSide, bottom: Tile.pithosTop }, color: '#b8643f', sound: 'stone', tool: 'pickaxe', tier: 1 },
  { key: 'amphora', hardness: 0.6, opaque: false, solid: true, tiles: { top: Tile.amphoraTop, side: Tile.amphoraSide, bottom: Tile.amphoraTop }, color: '#c27a50', sound: 'stone', tool: 'pickaxe', tier: 0 },
  { key: 'stall', hardness: 0.7, opaque: true, solid: true, tiles: { top: Tile.stallTop, side: Tile.stallSide, bottom: Tile.planks }, color: '#a87a51', sound: 'wood', tool: 'axe', tier: 0 },
]

export const blocks: BlockDef[] = defs.map((def, id) => ({ ...def, id: id as BlockId }))

const opaqueTable = new Uint8Array(256)
export const lightTable = new Uint8Array(256)
const solidTable = new Uint8Array(256)
for (const def of blocks) {
  opaqueTable[def.id] = def.opaque ? 1 : 0
  solidTable[def.id] = def.solid ? 1 : 0
  lightTable[def.id] = def.light ?? 0
}
export const isOpaque = (id: number) => opaqueTable[id] === 1
export const isSolid = (id: number) => solidTable[id] === 1
export const isKnownBlock = (id: number) => id >= 0 && id < blocks.length
export const isFlowing = (id: number) => id >= Block.flow1 && id <= Block.flow7
export const isWater = (id: number) => id === Block.water || isFlowing(id)
/** Blocks a ray or a placed block treats as empty space. */
export const isEmpty = (id: number) => id === Block.air || isWater(id)

export const blockByKey = new Map(blocks.map((def) => [def.key as string, def]))
