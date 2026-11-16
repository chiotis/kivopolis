/**
 * Time of day. `time` runs from 0 to 1: 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.
 * A full day lasts 20 minutes of play, with about 12 minutes of daylight.
 */
export const DAY_SECONDS = 1200
/** The time shown on the menu and when the cycle is switched off: a clear mid-morning. */
export const FIXED_TIME = 0.4

/** Runtime sky state, written by the Sky component every frame and read by shaders and scenery. */
export const sky = { time: FIXED_TIME, daylight: 1 }

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Unit vector towards the sun: it rises in the east (+x), passes south (+z) and sets in the west. */
export function sunDirection(time: number): [number, number, number] {
  const angle = (time - 0.25) * Math.PI * 2
  const x = Math.cos(angle), y = Math.sin(angle), z = 0.42
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

/** 1 in full daylight, 0 at night, easing through dawn and dusk. */
export function daylight(time: number) {
  return smooth(-0.1, 0.2, sunDirection(time)[1])
}

/** How warm the light is: 1 near sunrise and sunset, 0 at noon and at night. */
export function dusk(time: number) {
  const y = sunDirection(time)[1]
  return smooth(-0.15, 0.02, y) * (1 - smooth(0.05, 0.3, y))
}

/** Advances the clock; wraps around midnight. */
export function advance(time: number, seconds: number) {
  return (time + seconds / DAY_SECONDS) % 1
}

export const isNight = (time: number) => daylight(time) < 0.25

/**
 * One step of the day clock: moves the shared time on and reports whether night has fallen.
 * Plain code with no rendering, so a room server can keep the clock for everyone (Phase 12).
 */
export function stepDay(seconds: number) {
  sky.time = advance(sky.time, seconds)
  return { time: sky.time, night: isNight(sky.time) }
}
