import { isSolid } from './blocks'
import { submerged } from './flow'
import { OY, S, SY, bx, by, bz, wx, wy, wz } from './grid'
import type { Sampler } from './mesher'

export const PLAYER = {
  radius: 0.22,
  height: 1.6,
  crouchHeight: 1.3,
  eye: 1.45,
  crouchEye: 1.17,
  walk: 3.45,
  sprint: 6.4,
  crouch: 1.6,
  gravity: 24,
  /** Clears two blocks (1 unit); single blocks are climbed automatically. */
  jump: 7.4,
}
const EPS = 1e-4

export interface Vec3 { x: number; y: number; z: number }
export interface Body {
  position: Vec3
  velocity: Vec3
  onGround: boolean
  crouching: boolean
  /** Creative flight: no gravity, Space rises and C sinks. */
  flying: boolean
  /** Waist-deep or deeper in water: slow, buoyant movement; Space swims up and C dives. */
  inWater: boolean
}
export interface MoveInput {
  /** Desired horizontal direction in world space (any length; normalised here). */
  x: number
  z: number
  sprint: boolean
  jump: boolean
  crouch: boolean
}
export interface Circle { x: number; z: number; radius: number }
export interface Limits {
  /** Extra round colliders such as placed theatre pieces and signposts. */
  circles: Circle[]
  /** Island boundary: return false for positions the player may not enter. */
  bounds: (x: number, z: number) => boolean
}

export function newBody(x: number, y: number, z: number): Body {
  return { position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, onGround: false, crouching: false, flying: false, inWater: false }
}

const heightOf = (body: Body) => (body.crouching ? PLAYER.crouchHeight : PLAYER.height)

export function collides(world: Sampler, x: number, y: number, z: number, height: number) {
  const r = PLAYER.radius
  for (let iy = by(y); iy <= by(y + height - EPS); iy++) {
    for (let iz = bz(z - r); iz <= bz(z + r - EPS); iz++) {
      for (let ix = bx(x - r); ix <= bx(x + r - EPS); ix++) {
        if (isSolid(world.get(ix, iy, iz))) return true
      }
    }
  }
  return false
}

type Axis = 'x' | 'y' | 'z'

/** Moves along one axis in sub-block steps and snaps flush against the first solid block. */
function moveAxis(world: Sampler, body: Body, axis: Axis, delta: number) {
  const p = body.position
  const h = heightOf(body)
  const r = PLAYER.radius
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (S * 0.45)))
  const part = delta / steps
  for (let i = 0; i < steps; i++) {
    p[axis] += part
    if (!collides(world, p.x, p.y, p.z, h)) continue
    if (axis === 'y') p.y = part < 0 ? wy(by(p.y) + 1) + EPS : wy(by(p.y + h)) - h - EPS
    else if (axis === 'x') p.x = part > 0 ? wx(bx(p.x + r)) - r - EPS : wx(bx(p.x - r) + 1) + r + EPS
    else p.z = part > 0 ? wz(bz(p.z + r)) - r - EPS : wz(bz(p.z - r) + 1) + r + EPS
    return true
  }
  return false
}

function blockedByLimits(limits: Limits, x: number, z: number) {
  if (!limits.bounds(x, z)) return true
  return limits.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + PLAYER.radius)
}

const supported = (world: Sampler, body: Body) =>
  collides(world, body.position.x, body.position.y - 0.08, body.position.z, 0.08)

/** Returns how far the body was lifted by an automatic step, so the camera can smooth it. */
function moveHorizontal(world: Sampler, body: Body, axis: 'x' | 'z', delta: number, limits: Limits) {
  if (!delta) return 0
  const p = body.position
  const before = { ...p }
  let lifted = 0
  const blocked = moveAxis(world, body, axis, delta)
  // Swimmers climb out onto a one-block ledge the same way walkers step up.
  if (blocked && (body.onGround || body.inWater) && !body.crouching) {
    const blockedAt = { ...p }
    Object.assign(p, before)
    p.y += S + 0.02
    if (!collides(world, p.x, p.y, p.z, heightOf(body)) && !moveAxis(world, body, axis, delta)) {
      lifted = p.y - before.y
    } else {
      Object.assign(p, blockedAt)
    }
  }
  const crouchEdge = body.crouching && body.onGround && !supported(world, body)
  if (blockedByLimits(limits, p.x, p.z) || crouchEdge) {
    Object.assign(p, before)
    return 0
  }
  return lifted
}

const FLY_SPEED = 6.2
const FLY_RISE = 5
export const SWIM = { speed: 0.55, rise: 2.6, sink: 0.9, dive: 2.4 }

/** Water at waist height: the body floats and swims. */
export const wading = (world: Sampler, body: Body) =>
  submerged((x, y, z) => world.get(x, y, z), bx(body.position.x), (body.position.y + 0.35) / S + OY, bz(body.position.z))

export function stepBody(world: Sampler, body: Body, input: MoveInput, dt: number, limits: Limits) {
  if (body.flying) return fly(world, body, input, dt, limits)
  body.inWater = wading(world, body)
  if (body.inWater) body.crouching = false
  else if (input.crouch) body.crouching = true
  else if (body.crouching && !collides(world, body.position.x, body.position.y, body.position.z, PLAYER.height)) body.crouching = false

  const speed = (body.crouching ? PLAYER.crouch : input.sprint ? PLAYER.sprint : PLAYER.walk) * (body.inWater ? SWIM.speed : 1)
  const length = Math.hypot(input.x, input.z)
  const targetX = length ? (input.x / length) * speed : 0
  const targetZ = length ? (input.z / length) * speed : 0
  const grip = 1 - Math.exp(-dt * (body.inWater ? 6 : body.onGround ? 16 : 3.5))
  body.velocity.x += (targetX - body.velocity.x) * grip
  body.velocity.z += (targetZ - body.velocity.z) * grip

  let lifted = moveHorizontal(world, body, 'x', body.velocity.x * dt, limits)
  lifted += moveHorizontal(world, body, 'z', body.velocity.z * dt, limits)

  if (body.inWater) {
    // Buoyant: drift slowly down, swim up with Space, dive with C.
    const target = input.jump ? SWIM.rise : input.crouch ? -SWIM.dive : -SWIM.sink
    body.velocity.y += (target - body.velocity.y) * (1 - Math.exp(-dt * 5))
  } else {
    if (input.jump && body.onGround) body.velocity.y = PLAYER.jump
    body.velocity.y = Math.max(-30, body.velocity.y - PLAYER.gravity * dt)
  }
  const falling = body.velocity.y < 0
  const hit = moveAxis(world, body, 'y', body.velocity.y * dt)
  body.onGround = hit && falling
  if (hit) body.velocity.y = 0
  return lifted
}

export const eyeHeight = (body: Body) => (body.crouching ? PLAYER.crouchEye : PLAYER.eye)

/** Flight: smooth horizontal and vertical motion without gravity; touching the ground lands. */
function fly(world: Sampler, body: Body, input: MoveInput, dt: number, limits: Limits) {
  body.crouching = false
  const speed = input.sprint ? FLY_SPEED * 1.8 : FLY_SPEED
  const length = Math.hypot(input.x, input.z)
  const grip = 1 - Math.exp(-dt * 6)
  body.velocity.x += ((length ? (input.x / length) * speed : 0) - body.velocity.x) * grip
  body.velocity.z += ((length ? (input.z / length) * speed : 0) - body.velocity.z) * grip
  body.velocity.y += ((Number(input.jump) - Number(input.crouch)) * FLY_RISE - body.velocity.y) * grip
  for (const axis of ['x', 'z'] as const) {
    const before = { ...body.position }
    moveAxis(world, body, axis, body.velocity[axis] * dt)
    if (blockedByLimits(limits, body.position.x, body.position.z)) Object.assign(body.position, before)
  }
  const sinking = body.velocity.y < 0
  const hit = moveAxis(world, body, 'y', body.velocity.y * dt)
  // Keep the head inside the world's build height.
  const ceiling = wy(SY) - PLAYER.height
  if (body.position.y > ceiling) { body.position.y = ceiling; body.velocity.y = Math.min(0, body.velocity.y) }
  if (hit) {
    body.velocity.y = 0
    if (sinking) { body.flying = false; body.onGround = true }
  } else {
    body.onGround = false
  }
  return 0
}
