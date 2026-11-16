/** Edge length of one block in world units (the avatar is about 1.6 units tall). */
export const S = 0.5
export const SX = 384
export const SZ = 384
/** Grid size of save version 2 and earlier, before the island grew (Phase 11). */
export const OLD_SX = 144
export const OLD_SZ = 144
export const SY = 48
/** Block index of world x = 0 / z = 0. */
export const OX = SX / 2
export const OZ = SZ / 2
/** Block index whose bottom face sits at world y = 0. */
export const OY = 16
export const CHUNK = 16
/** Highest block index filled with sea water; its surface is drawn half a block down. */
export const SEA_Y = 14
/** Sea level in world units (the flat sea outside the grid sits here too). */
export const SEA_LEVEL = (SEA_Y + 0.5 - OY) * S
/** Top block of the open sea floor; outside the grid a flat floor continues at its surface. */
export const SEA_FLOOR_Y = 8
export const CX = SX / CHUNK
export const CZ = SZ / CHUNK

export const toBlock = (value: number, origin: number) => Math.floor(value / S + origin)
export const bx = (x: number) => toBlock(x, OX)
export const by = (y: number) => toBlock(y, OY)
export const bz = (z: number) => toBlock(z, OZ)
/** World coordinate of the low corner of a block. */
export const wx = (x: number) => (x - OX) * S
export const wy = (y: number) => (y - OY) * S
export const wz = (z: number) => (z - OZ) * S
export const inside = (x: number, y: number, z: number) =>
  x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ
export const index = (x: number, y: number, z: number) => (y * SZ + z) * SX + x
/** Chunk index (cz * CX + cx) of a grid index. */
export const chunkOfCell = (i: number) => Math.floor(Math.floor(i / SX) % SZ / CHUNK) * CX + Math.floor(i % SX / CHUNK)
