import { newBody, type Body } from '../voxel/physics'

/**
 * Per-frame player state shared by the camera rig, block interaction and HUD.
 * Kept outside React/zustand because it changes every frame.
 */
export const playerState: {
  body: Body
  /** Eye position and look direction for this frame, in world units. */
  eye: [number, number, number]
  look: [number, number, number]
} = {
  body: newBody(0, 0, 0),
  eye: [0, 0, 0],
  look: [0, 0, -1],
}

/** Mouse/touch buttons currently driving block interaction. */
export const blockInput = {
  breaking: false,
  /** How far the block under the crosshair has cracked (0–1), for the HUD meter. */
  progress: 0,
  /** Time (performance.now) of the last block broken or placed, which swings the held item. */
  swing: 0,
  /** A press of the break button not yet seen by a frame, so very short clicks still count. */
  breakOnce: false,
  placing: false,
  /** A single place request (click or tap) that has not been handled yet. */
  placeOnce: false,
  /** The current place action started with a fresh click (opens workshops and kilns). */
  placeClick: false,
}

let lastJumpTap = 0
/** A second tap of jump within 0.35 s toggles flight in creative play. */
export function jumpTapped(creative: boolean) {
  const now = performance.now()
  if (creative && now - lastJumpTap < 350) {
    playerState.body.flying = !playerState.body.flying
    playerState.body.velocity.y = 0
    lastJumpTap = 0
    return
  }
  lastJumpTap = now
}
