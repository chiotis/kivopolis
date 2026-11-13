/** Edge length of one block in world units (the avatar is about 1.6 units tall). */
export const S = 0.5
export const SX = 144
export const SZ = 144
export const SY = 48
/** Block index of world x = 0 / z = 0. */
export const OX = SX / 2
export const OZ = SZ / 2
/** Block index whose bottom face sits at world y = 0. */
export const OY = 16
export const CHUNK = 16
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
