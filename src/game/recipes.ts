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
  { pattern: ['CC', 'CC'], keys: { C: 'clayLump' }, result: { item: 'clay', count: 1 } },
  { ingredients: ['copperIngot', 'copperIngot', 'copperIngot', 'tinIngot'], result: { item: 'bronzeIngot', count: 4 } },
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
