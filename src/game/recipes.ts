import type { Stack } from './items'

export interface Recipe {
  /** Rows of single-character keys; spaces are empty cells. Absent for shapeless recipes. */
  pattern?: string[]
  keys?: Record<string, string>
  /** Shapeless ingredients (each entry is one item). */
  ingredients?: string[]
  result: Stack
}

const tool = (material: string, prefix: string): Recipe[] => [
  { pattern: ['MMM', ' S ', ' S '], keys: { M: material, S: 'stick' }, result: { item: `${prefix}Pickaxe`, count: 1 } },
  { pattern: ['MM', 'MS', ' S'], keys: { M: material, S: 'stick' }, result: { item: `${prefix}Axe`, count: 1 } },
  { pattern: ['M', 'S', 'S'], keys: { M: material, S: 'stick' }, result: { item: `${prefix}Shovel`, count: 1 } },
]

export const recipes: Recipe[] = [
  { ingredients: ['oliveLog'], result: { item: 'planks', count: 4 } },
  { pattern: ['P', 'P'], keys: { P: 'planks' }, result: { item: 'stick', count: 4 } },
  { pattern: ['PP', 'PP'], keys: { P: 'planks' }, result: { item: 'workshop', count: 1 } },
  { pattern: ['LLL', 'L L', 'LLL'], keys: { L: 'limestone' }, result: { item: 'kiln', count: 1 } },
  { pattern: ['LL', 'LL'], keys: { L: 'limestone' }, result: { item: 'ashlar', count: 4 } },
  // Crushed limestone: gravel for the diazoma without hunting for it on the ridges.
  { ingredients: ['limestone'], result: { item: 'gravel', count: 2 } },
  { pattern: ['CC', 'CC'], keys: { C: 'clayLump' }, result: { item: 'clay', count: 1 } },
  // A clay oil lamp set on a stick: the light of ancient homes and workshops.
  { pattern: ['C', 'S'], keys: { C: 'clayLump', S: 'stick' }, result: { item: 'lamp', count: 2 } },
  // A water jar shaped from three fired tiles: carries water from the sea or a spring.
  { pattern: ['T T', ' T '], keys: { T: 'terracotta' }, result: { item: 'hydria', count: 1 } },
  { ingredients: ['copperIngot', 'copperIngot', 'copperIngot', 'tinIngot'], result: { item: 'bronzeIngot', count: 4 } },
  // The temple (Phase 13): marble carved into the parts of a Doric temple, and bronze for the statue.
  { ingredients: ['marble'], result: { item: 'columnDrum', count: 1 } },
  { pattern: ['MM'], keys: { M: 'marble' }, result: { item: 'capital', count: 1 } },
  { pattern: ['M', 'M'], keys: { M: 'marble' }, result: { item: 'triglyph', count: 2 } },
  { pattern: ['MM', 'MM'], keys: { M: 'marble' }, result: { item: 'metope', count: 4 } },
  { pattern: ['MBM'], keys: { M: 'marble', B: 'bronzeIngot' }, result: { item: 'statueBase', count: 2 } },
  { ingredients: ['bronzeIngot'], result: { item: 'bronze', count: 1 } },
  // The agora (Phase 14): a lion's head carved for the fountain, clay pipes and jars from fired
  // tiles, and a market stall with a woollen awning.
  { pattern: ['MM', 'M '], keys: { M: 'marble' }, result: { item: 'lionSpout', count: 1 } },
  { pattern: ['TT'], keys: { T: 'terracotta' }, result: { item: 'pipe', count: 2 } },
  { pattern: ['T T', 'T T', 'TTT'], keys: { T: 'terracotta' }, result: { item: 'pithos', count: 1 } },
  { pattern: [' T ', 'T T', ' T '], keys: { T: 'terracotta' }, result: { item: 'amphora', count: 1 } },
  { pattern: ['WWW', 'P P'], keys: { W: 'wool', P: 'planks' }, result: { item: 'stall', count: 1 } },
  // The stadium (Phase 15): starting sills cut from limestone, and wedges of ashlar for the vault.
  { pattern: ['LLL'], keys: { L: 'limestone' }, result: { item: 'balbis', count: 2 } },
  { pattern: ['A A', ' A '], keys: { A: 'ashlar' }, result: { item: 'voussoir', count: 3 } },
  ...tool('planks', 'wood'),
  ...tool('limestone', 'stone'),
  ...tool('bronzeIngot', 'bronze'),
]

type Grid = (string | null)[][]

/** Crops empty rows and columns so a pattern matches anywhere in the grid. */
function trim(grid: Grid): Grid {
  const rows = grid.filter((row) => row.some(Boolean))
  if (!rows.length) return []
  const width = rows[0].length
  const used = Array.from({ length: width }, (_, x) => rows.some((row) => row[x]))
  const first = used.indexOf(true), last = used.lastIndexOf(true)
  return rows.map((row) => row.slice(first, last + 1))
}

function matchesShape(recipe: Recipe, grid: Grid, mirror: boolean) {
  const pattern = recipe.pattern!
  if (pattern.length !== grid.length || pattern[0].length !== grid[0].length) return false
  return pattern.every((row, y) => [...row].every((symbol, x) => {
    const cell = grid[y][mirror ? row.length - 1 - x : x]
    return symbol === ' ' ? !cell : cell === recipe.keys![symbol]
  }))
}

/** Finds the recipe for a square crafting grid (2 × 2 or 3 × 3) given as a flat list. */
export function matchRecipe(cells: (Stack | null)[], size: number): Recipe | null {
  const grid: Grid = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => cells[y * size + x]?.item ?? null))
  const trimmed = trim(grid)
  if (!trimmed.length) return null
  const present = cells.filter(Boolean).map((cell) => cell!.item).sort()
  for (const recipe of recipes) {
    if (recipe.ingredients) {
      const wanted = [...recipe.ingredients].sort()
      if (wanted.length === present.length && wanted.every((item, i) => item === present[i])) return recipe
    } else if (matchesShape(recipe, trimmed, false) || matchesShape(recipe, trimmed, true)) {
      return recipe
    }
  }
  return null
}
