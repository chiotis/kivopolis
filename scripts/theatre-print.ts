/**
 * Exports the finished theatre, with the hillside it is cut into, as a 3D-printable model.
 *
 *   npm run print-model            (15 cm across, written to scripts/dist/)
 *   npm run print-model -- 200     (any other width in millimetres)
 *
 * The island is generated exactly as the game does, every blueprint cell is filled with its
 * block, and a box around the theatre is cut out. That box becomes one solid: water, leaves,
 * trees, wheat and the nearby ruins are left out, hidden hollows are filled, loose pieces are dropped, and blocks
 * that touch only along an edge or at a corner get a filler block so the surface is manifold.
 * The result is written as a binary STL and a 3MF, in millimetres, flat side down.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { generate } from '../src/voxel/generate'
import { Block } from '../src/voxel/blocks'
import { SX, SY, SZ, bx, bz } from '../src/voxel/grid'
import { cells } from '../src/game/blueprints/theatre'

const WIDTH_MM = Number(process.argv[2] ?? 150)
/** Solid courses kept under the lowest ground in the box, so the print has a base. */
const BASE = 2
const MARGIN = 1

// 1. The island, as the game generates it, with the theatre finished.
const world = new Uint8Array(SX * SY * SZ)
const at = (x: number, y: number, z: number) => (y * SZ + z) * SX + x
generate({
  get: (x, y, z) => x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ ? world[at(x, y, z)] : Block.air,
  fill: (x, y, z, id) => { if (x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ) world[at(x, y, z)] = id },
})
const built = new Set<number>()
for (const cell of cells) {
  world[at(cell.x, cell.y, cell.z)] = cell.block
  built.add(at(cell.x, cell.y, cell.z))
}

// 2. The box around the theatre.
const x0 = Math.min(...cells.map((c) => c.x)) - MARGIN, x1 = Math.max(...cells.map((c) => c.x)) + MARGIN
const z0 = Math.min(...cells.map((c) => c.z)) - MARGIN, z1 = Math.max(...cells.map((c) => c.z)) + MARGIN
const left = new Set<number>([Block.air, Block.water, Block.flow1, Block.flow2, Block.flow3, Block.flow4, Block.flow5,
  Block.flow6, Block.flow7, Block.oliveLeaves, Block.cypressLeaves, Block.figLeaves, Block.wheat, Block.lamp])
const natural = new Set<number>([Block.grass, Block.soil, Block.sand, Block.limestone, Block.clay, Block.gravel, Block.path, Block.bedrock])
/** Highest natural ground block of a column (marble also lies in veins underground). */
const groundTop = (x: number, z: number) => {
  for (let y = SY - 1; y >= 0; y--) if (natural.has(world[at(x, y, z)])) return y
  return -1
}
const keeps = (x: number, y: number, z: number) => {
  const id = world[at(x, y, z)]
  if (left.has(id)) return false
  if (built.has(at(x, y, z))) return true
  // Tree trunks without their leaves would print as bare poles.
  if (id === Block.oliveLog) return false
  // Dressed stone standing on the ground belongs to the ruins, which the box edge cuts in half.
  if ((id === Block.ashlar || id === Block.marble) && y > groundTop(x, z)) return false
  return true
}
let floor = SY
for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
  let top = -1
  for (let y = SY - 1; y >= 0; y--) if (keeps(x, y, z)) { top = y; break }
  floor = Math.min(floor, top)
}
const y0 = floor - BASE + 1
let y1 = y0
for (let x = x0; x <= x1; x++) for (let y = y0; y < SY; y++) for (let z = z0; z <= z1; z++) if (keeps(x, y, z)) y1 = Math.max(y1, y)

// The model's own grid, with one empty cell of padding on every side.
const NX = x1 - x0 + 3, NY = y1 - y0 + 3, NZ = z1 - z0 + 3
const solid = new Uint8Array(NX * NY * NZ)
const id = (x: number, y: number, z: number) => (y * NZ + z) * NX + x
for (let x = 1; x < NX - 1; x++) for (let y = 1; y < NY - 1; y++) for (let z = 1; z < NZ - 1; z++) {
  solid[id(x, y, z)] = keeps(x0 + x - 1, y0 + y - 1, z0 + z - 1) ? 1 : 0
}
// The bottom course is always full, so the print has a flat base.
for (let x = 1; x < NX - 1; x++) for (let z = 1; z < NZ - 1; z++) solid[id(x, 1, z)] = 1

const STEPS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const
const within = (x: number, y: number, z: number) => x >= 0 && x < NX && y >= 0 && y < NY && z >= 0 && z < NZ

/** Face-connected flood fill over cells with the given value; returns the visited cells. */
function flood(start: number, value: number, seen: Uint8Array) {
  const found: number[] = [start]
  seen[start] = 1
  for (let i = 0; i < found.length; i++) {
    const c = found[i], x = c % NX, z = Math.floor(c / NX) % NZ, y = Math.floor(c / (NX * NZ))
    for (const [dx, dy, dz] of STEPS) {
      const nx = x + dx, ny = y + dy, nz = z + dz
      if (!within(nx, ny, nz)) continue
      const n = id(nx, ny, nz)
      if (!seen[n] && solid[n] === value) { seen[n] = 1; found.push(n) }
    }
  }
  return found
}

// 3. Fill hollows the outside air cannot reach, and drop pieces that do not touch the main body.
function cleanUp() {
  const outside = new Uint8Array(solid.length)
  flood(0, 0, outside)
  let filled = 0
  for (let c = 0; c < solid.length; c++) if (!solid[c] && !outside[c]) { solid[c] = 1; filled++ }
  const seen = new Uint8Array(solid.length)
  const parts: number[][] = []
  for (let c = 0; c < solid.length; c++) if (solid[c] && !seen[c]) parts.push(flood(c, 1, seen))
  parts.sort((a, b) => b.length - a.length)
  let dropped = 0
  for (const part of parts.slice(1)) for (const c of part) { solid[c] = 0; dropped++ }
  return { filled, dropped, pieces: parts.length - 1 }
}

// 4. Make the surface manifold: no two blocks may meet only along an edge or at a corner.
const get = (x: number, y: number, z: number) => within(x, y, z) ? solid[id(x, y, z)] : 0
/** Fills the lowest of the given empty cells (it is the best supported). */
function fillOne(options: [number, number, number][]) {
  options.sort((a, b) => a[1] - b[1])
  const [x, y, z] = options[0]
  solid[id(x, y, z)] = 1
}
function manifold() {
  let fixes = 0
  for (let pass = 0; pass < 50; pass++) {
    let changed = 0
    for (let x = 0; x < NX - 1; x++) for (let y = 0; y < NY - 1; y++) for (let z = 0; z < NZ - 1; z++) {
      // Each 2x2x2 cube around the vertex at (x+1, y+1, z+1).
      const corner: [number, number, number][] = []
      for (let i = 0; i < 8; i++) corner.push([x + (i & 1), y + ((i >> 1) & 1), z + ((i >> 2) & 1)])
      const value = corner.map(([a, b, c]) => get(a, b, c))
      const count = value.reduce((s, v) => s + v, 0)
      if (count === 0 || count === 8) continue
      // Edges: the four cells around each of the 12 edges through this cube's centre lines.
      for (let axis = 0; axis < 3; axis++) for (let side = 0; side < 2; side++) {
        const quad = [0, 1, 2, 3].map((k) => {
          const bits = [0, 0, 0]
          bits[axis] = side
          bits[(axis + 1) % 3] = k & 1
          bits[(axis + 2) % 3] = k >> 1
          return bits[0] | (bits[1] << 1) | (bits[2] << 2)
        })
        const [a, b, c, d] = quad.map((i) => value[i])
        if (a && d && !b && !c) { fillOne([corner[quad[1]], corner[quad[2]]]); changed++ }
        else if (b && c && !a && !d) { fillOne([corner[quad[0]], corner[quad[3]]]); changed++ }
      }
      if (changed) continue
      // Corners: the solid cells and the empty cells around the vertex must each be one face-connected group.
      const groups = (want: number) => {
        const seen = new Set<number>()
        let n = 0
        for (let i = 0; i < 8; i++) {
          if (value[i] !== want || seen.has(i)) continue
          n++
          const stack = [i]
          seen.add(i)
          while (stack.length) {
            const j = stack.pop()!
            for (const bit of [1, 2, 4]) {
              const k = j ^ bit
              if (value[k] === want && !seen.has(k)) { seen.add(k); stack.push(k) }
            }
          }
        }
        return n
      }
      if (groups(1) > 1 || groups(0) > 1) {
        fillOne(corner.filter((_, i) => !value[i]))
        changed++
      }
    }
    fixes += changed
    if (!changed) break
  }
  return fixes
}

const first = cleanUp()
const fixes = manifold()
const second = cleanUp()

// 5. Mesh: one quad per exposed block face, on shared integer vertices, outward-facing.
const mm = WIDTH_MM / Math.max(NX - 2, NZ - 2)
const vertices: number[] = []
const index = new Map<string, number>()
const triangles: number[] = []
/** Model axes: printer X = game x, printer Y = game -z (uphill at the back), printer Z = up. */
const vertex = (x: number, y: number, z: number) => {
  const key = `${x},${y},${z}`
  let i = index.get(key)
  if (i === undefined) {
    i = vertices.length / 3
    index.set(key, i)
    vertices.push((x - 1) * mm, (NZ - 1 - z) * mm, (y - 1) * mm)
  }
  return i
}
// Corners of each face, counter-clockwise seen from outside, in game coordinates.
const FACES: [[number, number, number], [number, number, number][]][] = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
]
for (let x = 0; x < NX; x++) for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) {
  if (!solid[id(x, y, z)]) continue
  for (const [[dx, dy, dz], quad] of FACES) {
    if (get(x + dx, y + dy, z + dz)) continue
    // The game-to-printer axes are a rotation, so the winding stays outward.
    const [a, b, c, d] = quad.map(([qx, qy, qz]) => vertex(x + qx, y + qy, z + qz))
    triangles.push(a, b, c, a, c, d)
  }
}

// 6. Write the STL and the 3MF.
function stl() {
  const count = triangles.length / 3
  const out = Buffer.alloc(84 + count * 50)
  out.write('Kivopolis theatre, millimetres', 0)
  out.writeUInt32LE(count, 80)
  for (let t = 0; t < count; t++) {
    const p = [0, 1, 2].map((k) => triangles[t * 3 + k] * 3)
    const [ax, ay, az] = [vertices[p[0]], vertices[p[0] + 1], vertices[p[0] + 2]]
    const [ux, uy, uz] = [vertices[p[1]] - ax, vertices[p[1] + 1] - ay, vertices[p[1] + 2] - az]
    const [vx, vy, vz] = [vertices[p[2]] - ax, vertices[p[2] + 1] - ay, vertices[p[2] + 2] - az]
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    const len = Math.hypot(...n) || 1
    let o = 84 + t * 50
    for (const v of n) { out.writeFloatLE(v / len, o); o += 4 }
    for (const q of p) for (let k = 0; k < 3; k++) { out.writeFloatLE(vertices[q + k], o); o += 4 }
  }
  return out
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (data: Buffer) => {
  let c = 0xffffffff
  for (const byte of data) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
/** A zip archive with stored (uncompressed) entries, which is all a 3MF needs. */
function zip(files: [string, string][]) {
  const parts: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const [name, text] of files) {
    const data = Buffer.from(text), path = Buffer.from(name), crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(path.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(path.length, 28)
    entry.writeUInt32LE(offset, 42)
    parts.push(local, path, data)
    central.push(entry, path)
    offset += 30 + path.length + data.length
  }
  const size = central.reduce((s, b) => s + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...central, end])
}
function threeMf() {
  const vs: string[] = [], ts: string[] = []
  for (let i = 0; i < vertices.length; i += 3) vs.push(`<vertex x="${vertices[i].toFixed(4)}" y="${vertices[i + 1].toFixed(4)}" z="${vertices[i + 2].toFixed(4)}"/>`)
  for (let i = 0; i < triangles.length; i += 3) ts.push(`<triangle v1="${triangles[i]}" v2="${triangles[i + 1]}" v3="${triangles[i + 2]}"/>`)
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">Kivopolis theatre</metadata>
<resources><object id="1" name="Kivopolis theatre" type="model"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object></resources>
<build><item objectid="1"/></build>
</model>`
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`],
    ['3D/3dmodel.model', model],
  ])
}

const dir = new URL(`file://${process.cwd()}/scripts/dist/`)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL('kivopolis-theatre.stl', dir), stl())
writeFileSync(new URL('kivopolis-theatre.3mf', dir), threeMf())
console.log(JSON.stringify({
  blocks: { x: NX - 2, y: NY - 2, z: NZ - 2 }, mmPerBlock: +mm.toFixed(3),
  sizeMm: { width: +((NX - 2) * mm).toFixed(1), depth: +((NZ - 2) * mm).toFixed(1), height: +((NY - 2) * mm).toFixed(1) },
  triangles: triangles.length / 3, hollowsFilled: first.filled + second.filled,
  looseBlocksDropped: first.dropped + second.dropped, loosePieces: first.pieces + second.pieces, manifoldFillers: fixes,
}, null, 2))
