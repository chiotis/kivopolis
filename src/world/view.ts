import { useGame } from '../game/store'
import { CHUNK, S } from '../voxel/grid'

/** How far the overview camera can pull back and slide: far enough to see the whole island. */
export const OVERVIEW_ZOOM = 150
export const OVERVIEW_PAN = 80

/** Half the diagonal of a chunk in world units, so a chunk shows while any part of it is in range. */
export const CHUNK_RADIUS = CHUNK * S * Math.SQRT1_2

/**
 * How far the world is drawn, in world units. Only the first-person view is limited: the menu,
 * the overview and the tour look at the whole island from outside.
 */
export function viewDistance(limit: number) {
  const { screen, mode } = useGame.getState()
  return screen === 'game' && mode === 'explore' ? limit : Infinity
}
