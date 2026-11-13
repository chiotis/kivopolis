import { rowBase, rowRadii, rowRise, siteMarker, tourMarker } from './theatre'

export function islandEdge(angle: number) {
  return 29 + 3.4 * Math.sin(angle * 3 + 0.7) + 1.8 * Math.sin(angle * 5 + 1.1)
}

export function ground(x: number, z: number): number {
  const radius = Math.hypot(x, z)
  const angle = Math.atan2(x, -z)
  const ridge = 5.7 * Math.exp(-((x + 10) ** 2 / 155 + (z + 17) ** 2 / 65))
    + 3.8 * Math.exp(-((x - 14) ** 2 / 54 + (z + 7) ** 2 / 240))
    + 2.5 * Math.exp(-((x + 19) ** 2 / 80 + (z - 5) ** 2 / 200))
  const wild = ridge + 0.38 * Math.sin(x * 0.39) * Math.cos(z * 0.32)
  const shore = Math.min(1, Math.max(0, (islandEdge(angle) - radius) / 5))
  const outside = wild * shore - (1 - shore) * 1.4
  if (radius < 4.18) return 0.03
  const row = Math.min(2, Math.max(0, Math.floor((radius - (rowRadii[0] - 0.67)) / 1.38)))
  const aisle = Math.min(Math.abs(angle - 0.44), Math.abs(angle + 0.44)) < 0.087
  const tier = rowBase + row * rowRise - 0.02 - (aisle ? 0.31 : 0)
  const approach = Math.max(0, Math.min(1, (Math.abs(angle) - 1.18) / 0.28))
  const shelf = (1 - approach) * tier + approach * 0.05
  const merge = Math.max(0, Math.min(1, (radius - 8.65) / 4))
  return shelf * (1 - merge) + outside * merge
}

export type Obstacle = { x: number; z: number; radius: number }
export const obstacles: Obstacle[] = [
  { x: siteMarker[0], z: siteMarker[2], radius: 0.4 },
  { x: tourMarker[0], z: tourMarker[2], radius: 0.35 },
  { x: 8.1, z: 4.4, radius: 0.76 },
  { x: 9.3, z: 5.4, radius: 0.6 },
  { x: -10.2, z: 5.2, radius: 1.65 },
  { x: 11.2, z: -6, radius: 1.7 },
  { x: -7.4, z: -6.7, radius: 0.7 },
  { x: 9.4, z: -2.2, radius: 0.55 },
  { x: 8.6, z: 10.4, radius: 0.55 },
]

export function canWalk(x: number, z: number, blockers: Obstacle[]) {
  const angle = Math.atan2(x, -z)
  return Math.hypot(x, z) < islandEdge(angle) - 3.2
    && !blockers.some((item) => Math.hypot(item.x - x, item.z - z) < item.radius + 0.23)
}
