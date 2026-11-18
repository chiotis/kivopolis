import { SPRING as AGORA_SPRING, springCells as agoraSpring } from './agora'
import { SPRING as STADIUM_SPRING, springCells as stadiumSpring } from './stadium'

/**
 * The island's springs: the agora's on the ridge (Phase 14) and the stadium's on the valley's north
 * hill (Phase 15). Each is four cells of water in a limestone rim that never runs dry; a pipe laid
 * from it makes a lion's-head spout run (voxel/plumbing.ts).
 */
export const SPRINGS = [AGORA_SPRING, STADIUM_SPRING] as const
export const springCells: readonly (readonly [number, number, number])[] = [...agoraSpring, ...stadiumSpring]
