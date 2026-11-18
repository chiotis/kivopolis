import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import { Tile } from './blocks'
import { ATLAS_TILES } from './mesher'

const PX = 16

function random(seed: number) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
}

type Paint = (x: number, y: number, rng: () => number) => string | null

function hex(color: string, shift: number) {
  const value = parseInt(color.slice(1), 16)
  const channel = (offset: number) => Math.max(0, Math.min(255, ((value >> offset) & 255) + shift))
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`
}

const speckle = (base: string, spread: number): Paint => (_x, _y, rng) => hex(base, Math.round((rng() - 0.5) * spread))

/** Original 16 px textures drawn in code: no image assets ship with the game. */
const painters: Record<number, Paint> = {
  [Tile.grassTop]: (_x, _y, rng) => {
    const r = rng()
    return r > 0.94 ? hex('#c9c27f', 0) : hex('#93a26f', Math.round((r - 0.5) * 30))
  },
  [Tile.grassSide]: (x, y, rng) => {
    const fringe = 3 + ((x * 7) % 3 === 0 ? 1 : 0)
    return y < fringe ? hex('#8f9e6b', Math.round((rng() - 0.5) * 24)) : hex('#9a7652', Math.round((rng() - 0.5) * 26))
  },
  [Tile.soil]: speckle('#9a7652', 28),
  [Tile.sand]: speckle('#e2cd9f', 18),
  [Tile.limestone]: (x, y, rng) => {
    const crack = (x + y * 3) % 11 === 0 && rng() > 0.4
    return crack ? hex('#b09a78', 0) : hex('#cdb995', Math.round((rng() - 0.5) * 20))
  },
  [Tile.marble]: (x, y, rng) => {
    const vein = Math.abs(Math.sin((x + y * 0.6) * 0.55) * 6 - (y % 6)) < 0.6
    return vein ? hex('#cfc7b8', 0) : hex('#efe9dc', Math.round((rng() - 0.5) * 10))
  },
  [Tile.clay]: speckle('#b98466', 20),
  [Tile.terracotta]: (x, y, rng) => {
    const groove = y % 4 === 3
    const ridge = (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0
    return groove || ridge ? hex('#9c5133', 0) : hex('#c06c48', Math.round((rng() - 0.5) * 16))
  },
  [Tile.logSide]: (x, _y, rng) => hex(x % 4 === 0 ? '#5d4431' : '#76583f', Math.round((rng() - 0.5) * 18)),
  [Tile.logTop]: (x, y) => {
    const ring = Math.round(Math.hypot(x - 7.5, y - 7.5)) % 3 === 0
    return ring ? '#6b4c35' : '#b08a62'
  },
  [Tile.oliveLeaves]: (_x, _y, rng) => {
    const r = rng()
    if (r < 0.16) return null
    return r > 0.9 ? '#a9ae7d' : hex('#7d8a59', Math.round((rng() - 0.5) * 34))
  },
  [Tile.cypressLeaves]: (_x, _y, rng) => {
    const r = rng()
    if (r < 0.1) return null
    return hex('#3f6448', Math.round((r - 0.5) * 30))
  },
  [Tile.gravel]: (_x, _y, rng) => hex(rng() > 0.5 ? '#a49a88' : '#8a8172', Math.round((rng() - 0.5) * 22)),
  [Tile.ashlar]: (x, y, rng) => {
    const course = Math.floor(y / 8)
    const joint = y % 8 === 7 || (x + course * 8) % 16 === 15
    return joint ? hex('#ad9470', 0) : hex('#dcc49c', Math.round((rng() - 0.5) * 14))
  },
  [Tile.planks]: (x, y, rng) => {
    const seam = y % 4 === 3 || (x + Math.floor(y / 4) * 5) % 16 === 0
    return seam ? '#7c5a3c' : hex('#a87a51', Math.round((rng() - 0.5) * 16))
  },
  [Tile.path]: speckle('#cfb888', 22),
  [Tile.pathSide]: (_x, y, rng) => hex(y < 2 ? '#cfb888' : '#9a7652', Math.round((rng() - 0.5) * 22)),
  [Tile.bedrock]: (_x, _y, rng) => hex(rng() > 0.6 ? '#4d4a44' : '#6d685f', 0),
  [Tile.workshopTop]: (x, y, rng) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7
    return edge ? '#6b4c35' : hex('#b58a5d', Math.round((rng() - 0.5) * 16))
  },
  [Tile.workshopSide]: (x, y, rng) => {
    const tool = (y > 3 && y < 7 && x > 2 && x < 13) || (x > 6 && x < 9 && y >= 7 && y < 12)
    if (tool) return hex('#8c8579', 0)
    return y % 5 === 4 ? '#7c5a3c' : hex('#a87a51', Math.round((rng() - 0.5) * 16))
  },
  [Tile.kilnSide]: (x, y, rng) => {
    if (y > 8 && y < 14 && x > 4 && x < 11) return y > 11 ? hex('#e08a3c', Math.round((rng() - 0.5) * 40)) : '#2b211b'
    const joint = y % 5 === 4 || (x + Math.floor(y / 5) * 4) % 8 === 7
    return joint ? '#7f705c' : hex('#a49276', Math.round((rng() - 0.5) * 16))
  },
  [Tile.kilnTop]: (x, y, rng) => (Math.hypot(x - 7.5, y - 7.5) < 3.4 ? '#2b211b' : hex('#a49276', Math.round((rng() - 0.5) * 16))),
  [Tile.copperOre]: (x, y, rng) => {
    const fleck = rng() > 0.8 && (x * 3 + y * 5) % 7 < 4
    return fleck ? (rng() > 0.4 ? '#c4743a' : '#4d9b7c') : hex('#c2ad8a', Math.round((rng() - 0.5) * 18))
  },
  [Tile.tinOre]: (x, y, rng) => {
    const fleck = rng() > 0.8 && (x * 5 + y * 3) % 7 < 4
    return fleck ? (rng() > 0.4 ? '#9fb0bd' : '#e7eef2') : hex('#c2ad8a', Math.round((rng() - 0.5) * 18))
  },
}

let cached: HTMLCanvasElement | null = null
let cachedUrl = ''

function drawAtlas() {
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PX * ATLAS_TILES
  const context = canvas.getContext('2d')!
  for (const [tile, paint] of Object.entries(painters)) {
    const index = Number(tile)
    const ox = (index % ATLAS_TILES) * PX, oy = Math.floor(index / ATLAS_TILES) * PX
    const rng = random(97 + index * 131)
    for (let y = 0; y < PX; y++) {
      for (let x = 0; x < PX; x++) {
        const color = paint(x, y, rng)
        if (!color) continue
        context.fillStyle = color
        context.fillRect(ox + x, oy + y, 1, 1)
      }
    }
  }
  cached = canvas
  return canvas
}

/** RGBA pixels of one 16 × 16 atlas tile, used to build thick pixel models of held items. */
export function tilePixels(tile: number) {
  const ox = (tile % ATLAS_TILES) * PX, oy = Math.floor(tile / ATLAS_TILES) * PX
  return drawAtlas().getContext('2d')!.getImageData(ox, oy, PX, PX).data
}

/** Data URL of the atlas, used for hotbar icons. */
export function atlasUrl() {
  cachedUrl ||= drawAtlas().toDataURL()
  return cachedUrl
}

// ---- Item icons: small shapes on a transparent background ---------------------------------
const handle = (x: number, y: number) => Math.abs(x + y - 15) <= 0.7 && x >= 2 && x <= 10
const handleColor = (x: number) => (x % 3 === 0 ? '#6b4c35' : '#8c6544')
const metal = { wood: '#b58a5d', stone: '#a49a88', bronze: '#c98a3c' }
type Head = (x: number, y: number) => boolean
const heads: Record<'Pickaxe' | 'Axe' | 'Shovel', Head> = {
  Pickaxe: (x, y) => Math.abs(x - y - 5) <= 1 && x + y >= 9 && x + y <= 21,
  Axe: (x, y) => x >= 8 && x <= 13 && y >= 2 && y <= 8 && x - y >= 3,
  Shovel: (x, y) => Math.hypot(x - 11, y - 4) <= 2.7,
}
const toolPainter = (material: keyof typeof metal, kind: keyof typeof heads): Paint => (x, y) => {
  if (heads[kind](x, y)) return (x + y) % 4 === 0 ? hex(metal[material], 30) : metal[material]
  return handle(x, y) ? handleColor(x) : null
}
const ingot = (color: string): Paint => (x, y) => {
  if (y < 6 || y > 11) return null
  const inset = (11 - y) * 0.5
  if (x < 2 + inset || x > 13 - inset) return null
  return y === 6 ? hex(color, 40) : y === 11 ? hex(color, -40) : color
}
const itemTiles: Record<number, Paint> = {
  32: (x, y) => (Math.abs(x + y - 15) <= 0.7 && x >= 3 && x <= 12 ? handleColor(x) : null),
  33: (x, y, rng) => (Math.hypot(x - 8, (y - 9) * 1.2) < 4.6 ? hex('#b98466', Math.round((rng() - 0.5) * 24)) : null),
  34: ingot('#c4743a'), 35: ingot('#aab7c0'), 36: ingot('#c98a3c'),
}
;(['wood', 'stone', 'bronze'] as const).forEach((material, m) => {
  (['Pickaxe', 'Axe', 'Shovel'] as const).forEach((kind, k) => { itemTiles[37 + k * 3 + m] = toolPainter(material, kind) })
})
// Oil lamp on a bronze stand (cut-out: transparent around the stand).
painters[Tile.lampSide] = (x, y) => {
  if (y <= 3 && Math.abs(x - 8.5) <= (y === 0 ? 0.5 : y === 1 ? 1 : 1.5)) return y <= 1 ? '#fff4c2' : '#f2b13c'
  if (y >= 4 && y <= 6 && x >= 4 && x <= 12) return y === 4 ? '#7a3f24' : x % 3 === 0 ? '#a65a35' : '#c06c48'
  if (y >= 7 && y <= 13 && (x === 7 || x === 8)) return x === 7 ? '#c98a3c' : '#9c6a2a'
  if (y >= 14 && x >= 4 && x <= 11) return y === 14 ? '#c98a3c' : '#8c5e27'
  return null
}
painters[Tile.lampTop] = (x, y) => {
  const r = Math.hypot(x - 7.5, y - 7.5)
  if (r < 1.6) return '#fff4c2'
  if (r < 2.6) return '#f2b13c'
  return r < 4.5 ? (r < 3.5 ? '#7a3f24' : '#c06c48') : null
}
painters[Tile.wool] = (x, y, rng) => {
  const curl = (Math.sin(x * 1.7 + y * 0.9) + Math.cos(y * 1.9 - x * 0.6)) > 1.2
  return curl ? hex('#d7d0bf', Math.round((rng() - 0.5) * 10)) : hex('#ece6d6', Math.round((rng() - 0.5) * 14))
}
// ---- The temple (Phase 13) ----------------------------------------------------------------
const marbleShade = (rng: () => number, shift = 0) => hex('#efe9dc', shift + Math.round((rng() - 0.5) * 8))
/** Doric flutes: four shallow grooves per block, meeting in sharp edges, so a 2 × 2 column shows eight a side. */
const flute = (x: number, rng: () => number) => {
  const phase = x % 4
  return phase === 0 ? hex('#cfc6b4', Math.round((rng() - 0.5) * 6)) : phase === 1 ? marbleShade(rng, -14) : marbleShade(rng, phase === 3 ? 6 : 0)
}
painters[Tile.drumSide] = (x, y, rng) => (y === 15 ? hex('#d8cfbe', 0) : flute(x, rng))
painters[Tile.drumTop] = (x, y, rng) => {
  // The bed of a drum: a smoothed band round the edge, a rougher middle and a square dowel hole.
  const edge = Math.min(x, y, 15 - x, 15 - y)
  if (x >= 7 && x <= 8 && y >= 7 && y <= 8) return '#8f8676'
  return edge < 3 ? marbleShade(rng, 4) : marbleShade(rng, -10 + Math.round((rng() - 0.5) * 10))
}
painters[Tile.capitalSide] = (x, y, rng) => {
  // From the top: the square abacus, the swelling echinus, three ring annulets, then the fluted neck.
  if (y <= 3) return y === 3 ? hex('#a99f8b', 0) : marbleShade(rng, 10)
  // The echinus catches the light at its shoulder and falls into shadow below.
  if (y <= 9) return marbleShade(rng, 8 - (y - 4) * 9)
  if (y <= 12) return y % 2 === 0 ? hex('#aaa08c', 0) : marbleShade(rng, 2)
  return flute(x, rng)
}
painters[Tile.capitalTop] = (x, y, rng) => (Math.min(x, y, 15 - x, 15 - y) === 0 ? hex('#d3cab8', 0) : marbleShade(rng, 6))
painters[Tile.triglyph] = (x, y, rng) => {
  // Three upright bars with two grooves between them and half-grooves at the edges, painted dark
  // blue as Greek temples were, under a light band.
  if (y <= 1) return y === 1 ? '#2e3b55' : '#4a5d80'
  const groove = x === 0 || x === 15 || x === 4 || x === 5 || x === 10 || x === 11
  return groove ? hex('#26314a', Math.round((rng() - 0.5) * 6)) : hex(x === 1 || x === 6 || x === 12 ? '#4f6388' : '#3d4e6b', Math.round((rng() - 0.5) * 8))
}
painters[Tile.metope] = (x, y, rng) => {
  // A plain square panel in a slightly sunken frame.
  const edge = Math.min(x, y, 15 - x, 15 - y)
  return edge === 0 ? hex('#cfc7b8', 0) : edge === 1 ? marbleShade(rng, -8) : marbleShade(rng, 4)
}
painters[Tile.statueBase] = (x, y, rng) => {
  // A moulded pedestal with a band of carved letters.
  if (y <= 1 || y >= 14) return y === 1 || y === 14 ? hex('#cbc2b0', 0) : marbleShade(rng, 8)
  if (y >= 6 && y <= 9 && x >= 2 && x <= 13) {
    const letter = (x * 5 + y * 3 + Math.floor(x / 3) * 7) % 4 === 0 || (y === 7 && x % 3 === 1)
    return letter ? '#8c7a5c' : marbleShade(rng, -4)
  }
  return marbleShade(rng, 0)
}
painters[Tile.bronze] = (x, y, rng) => {
  // Cast bronze: dark warm metal in soft mottled patches, with a little green patina here and there.
  const r = rng()
  if (r > 0.975) return hex('#6f9a86', Math.round((rng() - 0.5) * 10))
  const mottle = Math.round((Math.sin(x * 0.9 + y * 0.4) + Math.cos(y * 1.1 - x * 0.5)) * 5)
  return hex('#a07a45', mottle * 2 + Math.round((r - 0.5) * 8))
}
// ---- The agora (Phase 14) -----------------------------------------------------------------
const clayShade = (base: string, rng: () => number, shift = 0) => hex(base, shift + Math.round((rng() - 0.5) * 12))
painters[Tile.lionSpout] = (x, y, rng) => {
  // A lion's head carved in a marble slab: mane round the face, eyes, and the open mouth the water
  // runs from.
  const r = Math.hypot(x - 7.5, y - 7)
  if (y >= 9 && y <= 11 && x >= 6 && x <= 9) return y === 9 ? '#6b5f4c' : '#3a332b'
  if (y === 5 && (x === 5 || x === 10)) return '#4d4436'
  if (r < 4.2) return marbleShade(rng, r < 2 ? 6 : -4)
  if (r < 6.6) return hex('#c8b48f', ((x * 3 + y * 5) % 4 === 0 ? -22 : 0) + Math.round((rng() - 0.5) * 8))
  return marbleShade(rng, Math.min(x, y, 15 - x, 15 - y) === 0 ? -14 : 0)
}
painters[Tile.pipeSide] = (x, y, rng) => {
  // A run of fired clay sections laid in packed earth: a collar at the joint in the middle, and the
  // round pipe shaded darker towards its edges.
  if (y <= 2 || y >= 13) return clayShade('#9a7652', rng)
  if (x === 7 || x === 8) return clayShade('#8f4a2c', rng, y === 3 || y === 12 ? -10 : 0)
  return clayShade('#b8643f', rng, y <= 4 || y >= 11 ? -18 : y >= 6 && y <= 8 ? 10 : 0)
}
painters[Tile.pipeEnd] = (x, y, rng) => {
  const r = Math.hypot(x - 7.5, y - 7.5)
  if (r < 2.6) return '#2f2a26'
  if (r < 5.6) return clayShade('#b8643f', rng, r > 4.6 ? -18 : 0)
  return clayShade('#e2d3b5', rng)
}
/** A jar seen from the side: `half(y)` is its half-width at each row, null where it has no body. */
const jar = (half: (y: number) => number | null, band: (y: number) => boolean, base: string): Paint => (x, y, rng) => {
  const width = half(y)
  if (width === null || Math.abs(x - 7.5) > width) return null
  if (band(y)) return (x + y) % 3 === 0 ? '#c97a52' : '#2c1d16'
  return clayShade(base, rng, x < 6 ? -16 : x > 10 ? 6 : 0)
}
// The pithos: a big storage jar for grain, oil or wine, almost as tall as a person, with a rope pattern.
painters[Tile.pithosSide] = jar((y) => y <= 1 ? 4 : y <= 3 ? 5.2 : y <= 11 ? 6.8 - Math.abs(y - 6) * 0.25 : 6 - (y - 11) * 0.9, (y) => y === 5, '#b8643f')
painters[Tile.pithosTop] = (x, y, rng) => {
  const r = Math.hypot(x - 7.5, y - 7.5)
  return r < 3 ? '#2a1d17' : r < 4.4 ? clayShade('#8f4a2c', rng) : r < 7 ? clayShade('#b8643f', rng) : null
}
// The amphora: two handles, a narrow neck and a pointed foot, for carrying wine and oil by ship.
painters[Tile.amphoraSide] = (x, y, rng) => {
  if ((x === 4 || x === 11) && y >= 2 && y <= 5) return '#9c5133'
  if (y <= 1) return Math.abs(x - 7.5) <= 2 ? (y === 0 ? '#8f4a2c' : '#c27a50') : null
  return jar((row) => row <= 4 ? 1.6 : row <= 11 ? 1.6 + Math.min(row - 4, 3) * 1.2 - Math.max(0, row - 9) * 1.1 : row <= 15 ? 2.2 - (row - 11) * 0.5 : null,
    (row) => row === 7, '#c27a50')(x, y, rng)
}
painters[Tile.amphoraTop] = (x, y, rng) => {
  const r = Math.hypot(x - 7.5, y - 7.5)
  return r < 1.6 ? '#2a1d17' : r < 2.6 ? clayShade('#8f4a2c', rng) : r < 5.2 ? clayShade('#c27a50', rng) : null
}
// A market stall: a plank counter under a striped awning of woollen cloth.
painters[Tile.stallSide] = (x, y, rng) => {
  if (y <= 4) return y === 4 ? '#7a5838' : (Math.floor(x / 3) % 2 === 0 ? hex('#b84a3a', Math.round((rng() - 0.5) * 10)) : hex('#ece6d6', Math.round((rng() - 0.5) * 8)))
  // Under the awning: the shade between two posts, then the counter's front edge.
  if (y <= 7) return x === 1 || x === 14 ? '#6b4c35' : y === 7 ? '#7a5838' : hex('#3b2f25', Math.round((rng() - 0.5) * 6))
  return painters[Tile.planks](x, y, rng)
}
painters[Tile.stallTop] = (x, y, rng) => (Math.floor(x / 3) % 2 === 0 ? hex('#b84a3a', Math.round((rng() - 0.5) * 10)) : hex('#ece6d6', Math.round((rng() - 0.5) * 8)))
// The starting sill (βαλβίς): limestone with two parallel grooves across it, where the runners set
// their toes, and the joints between the slabs at its ends.
painters[Tile.balbisTop] = (x, y, rng) => {
  if (y === 4 || y === 9) return hex('#7f705c', Math.round((rng() - 0.5) * 6))
  if (y === 5 || y === 10) return hex('#a49276', Math.round((rng() - 0.5) * 6))
  if (x === 0 || x === 15) return '#ad9470'
  return hex('#cdb995', Math.round((rng() - 0.5) * 14))
}
// The vault stone: an ashlar wedge, its joints leaning in towards the centre of the arch below.
painters[Tile.voussoir] = (x, y, rng) => {
  const left = Math.round(1 + y * 0.2), right = Math.round(14 - y * 0.2)
  if (y === 0 || x === left || x === right) return hex('#ad9470', 0)
  if (x === left + 1 || x === right - 1) return hex('#c7ad85', Math.round((rng() - 0.5) * 8))
  return hex('#dcc49c', Math.round((rng() - 0.5) * 14))
}
// Milk in a small clay jug, and a white feather.
itemTiles[46] = (x, y) => {
  if (y >= 3 && y <= 4 && x >= 6 && x <= 10) return '#f6f3ea'
  if (y === 2 && x >= 5 && x <= 11) return '#8f4a2c'
  const half = y < 7 ? 2.6 : y < 13 ? 4.2 - Math.abs(y - 10) * 0.25 : 2.6
  if (y >= 5 && y <= 14 && Math.abs(x - 8) <= half) return x < 7 ? '#a65a35' : '#c06c48'
  if (x >= 12 && x <= 13 && y >= 6 && y <= 10 && !(x === 12 && y > 6 && y < 10)) return '#a65a35'
  return null
}
itemTiles[47] = (x, y) => {
  const t = (x + y - 15) / 1, along = (x - y + 0) / 2
  if (Math.abs(t) <= 0.6 && x >= 3 && x <= 12) return '#b8a88a'
  if (Math.abs(t) <= 2.6 && x >= 6 && x <= 13 && y >= 2 && Math.abs(along) < 8) return (x + y) % 3 === 0 ? '#e4dfd2' : '#fbf8f0'
  return null
}
// The hydria: a terracotta water jar with a black-figure band, empty or brimming with water.
const hydria = (full: boolean): Paint => (x, y) => {
  if (y <= 2 && x >= 6 && x <= 10) return full && y >= 1 ? '#6fb8c2' : y === 0 ? '#7a3f24' : '#2c1d16'
  if (y >= 3 && y <= 4 && x >= 7 && x <= 9) return '#a65a35'
  // Side handles.
  if ((x === 3 || x === 13) && y >= 6 && y <= 9) return '#8f4a2c'
  const half = y < 5 ? 0 : y <= 10 ? 2.4 + (y - 5) * 0.55 : 5.2 - (y - 10) * 0.9
  if (y >= 5 && y <= 14 && Math.abs(x - 8) <= half) {
    if (y === 8 || y === 9) return (x + y) % 3 === 0 ? '#c06c48' : '#231915'
    return x < 7 ? '#a65a35' : '#c97a52'
  }
  if (y === 15 && x >= 6 && x <= 10) return '#7a3f24'
  return null
}
itemTiles[48] = hydria(false)
itemTiles[49] = hydria(true)
// Survival (Phase 16). The fig's broad, lobed leaves, darker than the olive's, with a few figs among them.
painters[Tile.figLeaves] = (x, y, rng) => {
  const r = rng()
  if (r < 0.12) return null
  if ((x * 5 + y * 3) % 23 === 0) return '#6b3f5a'
  const vein = (x + y) % 5 === 0
  return vein ? '#86a35a' : hex('#5f7d3c', Math.round((r - 0.5) * 30))
}
// Wild wheat: stalks rising from the ground with golden ears, transparent between them.
painters[Tile.wheat] = (x, y, rng) => {
  const stalk = [1, 4, 6, 9, 11, 14].indexOf(x)
  if (stalk < 0) return null
  const top = 2 + ((stalk * 5) % 4)
  if (y < top) return null
  if (y < top + 4) return (x + y) % 2 === 0 ? '#e6c66d' : hex('#c9a046', Math.round((rng() - 0.5) * 16))
  return y > 12 ? '#7d8a4a' : hex('#b9a45b', Math.round((rng() - 0.5) * 18))
}
painters[Tile.wheatTop] = (x, y) => ((x * 7 + y * 5) % 9 === 0 ? '#e6c66d' : null)
// Food: an olive on a sprig, a ripe fig, a round of dough and a loaf of bread.
itemTiles[67] = (x, y) => {
  if (Math.hypot(x - 7, (y - 9) * 0.8) < 3.6) return Math.hypot(x - 6, y - 8) < 1.2 ? '#8d8f63' : '#4c4a2c'
  if (y >= 2 && y <= 5 && Math.abs(x - y - 5) <= 0.6) return '#6b4c35'
  if (Math.hypot(x - 12, y - 3) < 2 && x > y + 6) return '#7d8a59'
  return null
}
itemTiles[68] = (x, y) => {
  if (y >= 2 && y <= 4 && x >= 7 && x <= 8) return '#6b4c35'
  const half = y < 5 ? 0 : y < 9 ? (y - 4) * 1.1 : 4.6 - Math.max(0, y - 12) * 1.2
  if (y >= 5 && y <= 14 && Math.abs(x - 7.5) <= half) return x < 6 ? '#4f2d43' : x > 10 && y < 10 ? '#8c5a7a' : '#6b3f5a'
  return null
}
itemTiles[69] = (x, y, rng) => {
  const r = Math.hypot(x - 7.5, (y - 9) * 1.4)
  if (r > 6) return null
  return r > 5.2 ? '#cdb58d' : hex('#eadcb9', Math.round((rng() - 0.5) * 12))
}
itemTiles[70] = (x, y, rng) => {
  const r = Math.hypot((x - 7.5) * 0.85, (y - 9) * 1.3)
  if (r > 6 || y > 13) return null
  if (y === 13) return '#7a4a26'
  // Scored across the top, as Greek loaves were.
  if (y < 9 && (x === 5 || x === 10)) return '#d9a65c'
  return r > 5 ? '#8a5428' : hex('#b5733a', Math.round((rng() - 0.5) * 18))
}
// The κλίνη: from above, a woollen mattress with a feather pillow at its head inside a wooden
// frame; from the side, the frame and mattress on four turned legs, open beneath.
painters[Tile.klineTop] = (x, y, rng) => {
  if (x === 0 || x === 15 || y === 0 || y === 15) return '#76583f'
  if (y <= 4) return hex('#fbf8f0', Math.round((rng() - 0.5) * 8))
  return (x + y * 2) % 7 === 0 ? '#c9b48a' : hex('#a8452f', Math.round((rng() - 0.5) * 14))
}
painters[Tile.klineSide] = (x, y, rng) => {
  if (y >= 3 && y <= 5) return y === 3 ? hex('#ece6d6', 0) : hex('#a8452f', Math.round((rng() - 0.5) * 12))
  if (y >= 6 && y <= 8) return y === 6 ? '#a87a51' : hex('#8c6544', Math.round((rng() - 0.5) * 10))
  if (y >= 9 && (x <= 1 || x >= 14)) return y === 12 ? '#a87a51' : '#6b4c35'
  return null
}
Object.assign(painters, itemTiles)

export function createAtlas() {
  const texture = new CanvasTexture(drawAtlas())
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  return texture
}

let shared: CanvasTexture | null = null
/** One atlas texture shared by terrain, dropped items and held items. */
export function sharedAtlas() {
  shared ??= createAtlas()
  return shared
}
