import { blocks, isOpaque } from './blocks'
import { CHUNK, SY, wx, wy, wz } from './grid'

export const ATLAS_TILES = 8
const INSET = 0.002

export interface Sampler {
  get(x: number, y: number, z: number): number
  /** Block light 0–15; samplers without lamps may leave it out. */
  lightAt?(x: number, y: number, z: number): number
}

export interface ChunkMesh {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  colors: Float32Array
  /** Block light per vertex, 0–1. */
  lights: Float32Array
  indices: Uint32Array
  faces: number
}

type Vec = [number, number, number]
interface Face { normal: Vec; corners: [Vec, Vec, Vec, Vec]; tile: 'top' | 'side' | 'bottom' }

// Corners wind counter-clockwise seen from outside; corner 0 → 1 runs up the face for sides.
const FACES: Face[] = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], tile: 'side' },
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], tile: 'side' },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: 'top' },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: 'bottom' },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], tile: 'side' },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], tile: 'side' },
]
const UV: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]]
const AO_LEVEL = [0.46, 0.64, 0.82, 1]

export function tileUV(tile: number, u: number, v: number): [number, number] {
  const col = tile % ATLAS_TILES, row = Math.floor(tile / ATLAS_TILES)
  const uu = INSET + u * (1 - 2 * INSET), vv = INSET + v * (1 - 2 * INSET)
  return [(col + uu) / ATLAS_TILES, 1 - (row + 1 - vv) / ATLAS_TILES]
}

/**
 * Builds face-culled geometry with per-vertex ambient occlusion for one 16 × 16 column of blocks.
 * With `ao: false` (low quality) every corner is fully lit.
 */
export function meshChunk(world: Sampler, cx: number, cz: number, { ao: smooth = true }: { ao?: boolean } = {}): ChunkMesh {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const lights: number[] = []
  const indices: number[] = []
  const occludes = (x: number, y: number, z: number) => isOpaque(world.get(x, y, z))
  const lightAt = world.lightAt ? (x: number, y: number, z: number) => world.lightAt!(x, y, z) : () => 0
  const x0 = cx * CHUNK, z0 = cz * CHUNK

  for (let y = 0; y < SY; y++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        const id = world.get(x, y, z)
        if (!id) continue
        const def = blocks[id]
        for (const face of FACES) {
          const [nx, ny, nz] = face.normal
          const neighbour = world.get(x + nx, y + ny, z + nz)
          if (isOpaque(neighbour) || (neighbour === id && !def.opaque)) continue
          if (ny === -1 && y === 0) continue
          const tile = def.tiles[face.tile]
          const start = positions.length / 3
          const ao: number[] = []
          face.corners.forEach((corner, i) => {
            positions.push(wx(x + corner[0]), wy(y + corner[1]), wz(z + corner[2]))
            normals.push(nx, ny, nz)
            uvs.push(...tileUV(tile, UV[i][0], UV[i][1]))
            // The two tangent axes of this face, pointing towards the corner.
            const offset = corner.map((c) => (c ? 1 : -1))
            const t: Vec[] = []
            for (let axis = 0; axis < 3; axis++) {
              if (face.normal[axis] !== 0) continue
              const v: Vec = [0, 0, 0]
              v[axis] = offset[axis]
              t.push(v)
            }
            const bx = x + nx, by = y + ny, bz = z + nz
            const side1 = occludes(bx + t[0][0], by + t[0][1], bz + t[0][2]) ? 1 : 0
            const side2 = occludes(bx + t[1][0], by + t[1][1], bz + t[1][2]) ? 1 : 0
            const cornerBlock = occludes(bx + t[0][0] + t[1][0], by + t[0][1] + t[1][1], bz + t[0][2] + t[1][2]) ? 1 : 0
            const level = !smooth ? 3 : side1 && side2 ? 0 : 3 - side1 - side2 - cornerBlock
            ao.push(level)
            const shade = AO_LEVEL[level]
            colors.push(shade, shade, shade)
            // Smooth light: average the open cells around this corner, as for occlusion.
            if (def.light) {
              lights.push(1)
            } else {
              let sum = lightAt(bx, by, bz), open = 1
              if (!side1) { sum += lightAt(bx + t[0][0], by + t[0][1], bz + t[0][2]); open++ }
              if (!side2) { sum += lightAt(bx + t[1][0], by + t[1][1], bz + t[1][2]); open++ }
              if (!cornerBlock && !(side1 && side2)) { sum += lightAt(bx + t[0][0] + t[1][0], by + t[0][1] + t[1][1], bz + t[0][2] + t[1][2]); open++ }
              lights.push(sum / open / 15)
            }
          })
          // Flip the diagonal so AO gradients interpolate without a visible seam.
          if (ao[0] + ao[2] < ao[1] + ao[3]) {
            indices.push(start + 1, start + 2, start + 3, start + 1, start + 3, start)
          } else {
            indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
          }
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    lights: new Float32Array(lights),
    indices: new Uint32Array(indices),
    faces: indices.length / 6,
  }
}

