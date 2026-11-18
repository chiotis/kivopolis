import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { useGame, useShared } from '../game/store'
import { islandEdge, type Obstacle } from '../game/terrain'
import { siteMarker, spawn, tourMarker, type Point } from '../game/theatre'
import { eyeHeight, stepBody, type Limits } from '../voxel/physics'
import { raycast } from '../voxel/raycast'
import { SX, SZ, getWorld, bx, by, bz, wx, wz } from '../voxel/world'
import { blocks } from '../voxel/blocks'
import { blockSound, hurtSound } from '../game/audio'
import { copy } from '../game/el'
import { fallDamage, hurt, survivalActive, tickSurvival, wake } from '../game/survival'
import { signposts } from '../game/buildings'
import { playerState } from './player'
import { OVERVIEW_PAN } from './view'
import { BALBIDES, TRACK } from '../game/blueprints/stadium'

export const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift', ' ', 'c'])
export const keys = new Set<string>()
// Terrain, trees and ruins collide as voxels; only the signposts remain round colliders.
const staticObstacles: Obstacle[] = [
  { x: siteMarker[0], z: siteMarker[2], radius: 0.4 },
  { x: tourMarker[0], z: tourMarker[2], radius: 0.35 },
  ...signposts.map(({ x, z }) => ({ x, z, radius: 0.4 })),
]
/** The island and a strip of sea to swim in, kept inside the block world. */
const islandBounds = (x: number, z: number) => Math.hypot(x, z) < islandEdge(Math.atan2(x, -z)) + 2.5
  && Math.abs(x) < wx(SX) - 1 && Math.abs(z) < wz(SZ) - 1
export interface View {
  yaw: number
  pitch: number
  zoom: number
  x: number
  z: number
  walkYaw: number
  walkPitch: number
}
/** First- or third-person view while exploring; toggled with V. */
export const viewMode = { third: false }
export const initialView = (): View => ({ yaw: 0.18, pitch: 0.88, zoom: 24, x: 0, z: 0.8, walkYaw: -0.11, walkPitch: -0.12 })

/** The highest point since the player last stood, swam or flew; a move to a new place starts it again. */
const fall = { top: -Infinity }

function respawn(x: number, z: number) {
  const body = playerState.body
  fall.top = -Infinity
  Object.assign(body.position, { x, y: getWorld().surface(x, z) + 0.01, z })
  Object.assign(body.velocity, { x: 0, y: 0, z: 0 })
  body.crouching = false
  body.flying = false
}

export function CameraRig({ view, player, marker }: {
  view: RefObject<View>; player: RefObject<Vector3>; marker: RefObject<HTMLDivElement | null>
}) {
  const { camera, size, gl } = useThree()
  const focus = useRef(new Vector3(0, 1, 0))
  const destination = useRef(new Vector3())
  const target = useRef(new Vector3())
  const projection = useRef(new Vector3())
  const stageElement = useRef<HTMLElement | null>(null)
  const heading = useRef(0)
  useEffect(() => { stageElement.current = gl.domElement.closest<HTMLElement>('.stage') }, [gl])
  const walk = useRef({
    lastSave: 0, dirty: false, facing: Math.PI, touring: 0,
    limits: { circles: staticObstacles, bounds: islandBounds } as Limits,
    /** Seconds spent in the current explore session; the camera glides in at first. */
    settle: 0, eyeLag: 0,
    /** Distance walked on the ground since the last footstep. */
    stride: 0,
  })

  useEffect(() => {
    const [x, , z] = useGame.getState().player
    respawn(x, z)
    return useGame.subscribe((current, previous) => {
      if (current.screen === 'game' && previous.screen !== 'game') {
        const [px, , pz] = current.player
        respawn(px, pz)
        view.current.walkYaw = initialView().walkYaw
        view.current.walkPitch = initialView().walkPitch
      }
      if (current.mode === 'overview' && previous.mode !== 'overview') Object.assign(view.current, {
        yaw: 0.18, pitch: 0.88, zoom: 24, x: 0, z: 0.8,
      })
      if (current.mode !== previous.mode || current.screen !== previous.screen) walk.current.settle = 0
      if (current.mode === 'tour' && previous.mode !== 'tour') walk.current.touring = 0
    })
  }, [player, view])

  useFrame((_, elapsed) => {
    const dt = Math.min(elapsed, 0.045)
    const state = useGame.getState()
    const memory = walk.current
    const orbit = view.current
    const center = target.current
    const eye = destination.current
    const exploring = state.screen === 'game' && state.mode === 'explore'
    let smooth = state.settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 8)

    if (state.screen === 'menu') {
      center.set(-0.4, 0.85, -1.5)
      eye.set(12.0, 11.9, 23.5)
    } else if (state.mode === 'overview') {
      // W A S D or the arrows slide the view over the island, relative to where it looks; Shift is faster.
      const ahead = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
      const side = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)
      if ((ahead || side) && !state.panel) {
        const speed = (8 + orbit.zoom * 0.45) * (keys.has('shift') ? 2.5 : 1) * dt / Math.hypot(ahead, side)
        const sin = Math.sin(orbit.yaw), cos = Math.cos(orbit.yaw)
        orbit.x = MathUtils.clamp(orbit.x + (-sin * ahead + cos * side) * speed, -OVERVIEW_PAN, OVERVIEW_PAN)
        orbit.z = MathUtils.clamp(orbit.z + (-cos * ahead - sin * side) * speed, -OVERVIEW_PAN, OVERVIEW_PAN)
      }
      center.set(orbit.x, 0.95, orbit.z - 0.60)
      eye.set(
        center.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.zoom,
        center.y + Math.sin(orbit.pitch) * orbit.zoom,
        center.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.zoom,
      )
    } else if (state.mode === 'tour' && state.tour === 'stadium') {
      // The closing run: from the west starting line to the east one at a runner's eye height, then
      // up over the east end to look back down the whole stadium.
      if (!state.panel) memory.touring += dt
      const time = memory.touring
      const lane = wz(TRACK.z0 + 3) + 0.5, ground = (TRACK.y + 1 - by(0)) * 0.5
      const start = wx(BALBIDES[0]) + 0.25, finish = wx(BALBIDES[1]) + 0.25
      const RUN = 6, RISE = 5
      if (state.settings.reducedMotion) {
        eye.set(finish + 9, ground + 9, lane + 9)
        center.set((start + finish) / 2, ground, lane)
      } else if (time < RUN) {
        const pace = time / RUN, x = start + (finish - start) * (pace * pace * (3 - 2 * pace) * 0.35 + pace * 0.65)
        eye.set(x, ground + 1.45 + Math.abs(Math.sin(time * 9)) * 0.08, lane)
        center.set(x + 6, ground + 1.1, lane)
      } else {
        const rise = MathUtils.smoothstep(time, RUN, RUN + RISE)
        eye.set(finish + rise * 9, ground + 1.45 + rise * 9, lane + rise * 9)
        center.set(finish + (((start + finish) / 2) - finish) * rise + 6 * (1 - rise), ground + 1.1 * (1 - rise), lane)
      }
      if (time > (state.settings.reducedMotion ? 4 : RUN + RISE + 1.5)) state.endTour()
    } else if (state.mode === 'tour') {
      if (!state.panel) memory.touring += dt
      const time = memory.touring
      const angle = state.settings.reducedMotion ? 0.3 : -0.55 + time * 0.15
      center.set(0, 1.0, -1.1)
      eye.set(Math.sin(angle) * 19.7, 7.5 + Math.min(time, 10) * 0.49, Math.cos(angle) * 19.7)
      if (time > (state.settings.reducedMotion ? 4 : 13)) state.endTour()
    } else {
      const world = getWorld()
      const body = playerState.body
      const active = (first: string, second: string) => Number(keys.has(first) || keys.has(second))
      const free = !state.panel
      const dx = free ? active('d', 'arrowright') - active('a', 'arrowleft') : 0
      const dz = free ? active('s', 'arrowdown') - active('w', 'arrowup') : 0
      const sin = Math.sin(orbit.walkYaw), cos = Math.cos(orbit.walkYaw)
      const moveX = dx * cos + dz * sin, moveZ = dz * cos - dx * sin
      const before = { ...body.position }
      if (!useShared.getState().creative) body.flying = false
      const wasInWater = body.inWater
      const wasOnGround = body.onGround
      const lifted = stepBody(world, body, {
        x: moveX, z: moveZ, sprint: keys.has('shift'), jump: free && keys.has(' '), crouch: free && keys.has('c'),
      }, dt, memory.limits)
      if (body.inWater && !wasInWater && state.settings.sound) blockSound('water', 'break')
      if (body.position.y < -6) respawn(spawn[0], spawn[2])
      // Survival: a long fall onto solid ground hurts, measured from its highest point; water,
      // flight and standing all start the count again.
      fall.top = Math.max(fall.top, before.y)
      if (body.onGround && !wasOnGround && !body.flying && !body.inWater && !wasInWater) {
        const damage = fallDamage(fall.top - body.position.y)
        if (damage > 0 && survivalActive()) {
          const fainted = hurt(damage)
          if (state.settings.sound) hurtSound()
          if (fainted) {
            respawn(spawn[0], spawn[2])
            wake()
            state.setNotice(copy.fainted)
          }
        }
      }
      if (body.onGround || body.flying || body.inWater) fall.top = body.position.y
      // Hunger and healing wait while a window (the pause menu, the backpack) is open.
      if (free) tickSurvival(dt, keys.has('shift') && (moveX || moveZ) ? 2 : 1)
      if (moveX || moveZ) memory.facing = Math.atan2(moveX, moveZ)
      // Smooth automatic step-ups so climbing a block does not jolt the view.
      memory.eyeLag = state.settings.reducedMotion ? 0 : MathUtils.damp(memory.eyeLag - lifted, 0, 14, dt)
      const position = player.current.set(body.position.x, body.position.y, body.position.z)
      const walked = Math.hypot(position.x - before.x, position.z - before.z)
      if (walked > 1e-5) memory.dirty = true
      // A footstep every 0.85 units on the ground, sounding like the block underfoot.
      if (body.onGround && !body.flying && !body.inWater && walked > 1e-5) {
        memory.stride += walked
        if (memory.stride > 0.85) {
          memory.stride = 0
          const under = world.get(bx(position.x), by(position.y - 0.05), bz(position.z))
          if (under && state.settings.sound && !body.crouching) blockSound(blocks[under].sound, 'step')
        }
      } else if (!body.onGround) memory.stride = 0.6
      if (memory.dirty && (performance.now() - memory.lastSave > 170 || !(dx || dz))) {
        state.updatePlayer(position.toArray() as Point)
        memory.lastSave = performance.now()
        memory.dirty = false
      }

      const pitch = orbit.walkPitch
      const look = playerState.look
      look[0] = -sin * Math.cos(pitch); look[1] = Math.sin(pitch); look[2] = -cos * Math.cos(pitch)
      const head = playerState.eye
      head[0] = position.x; head[1] = position.y + eyeHeight(body) + memory.eyeLag; head[2] = position.z
      if (viewMode.third) {
        const hit = raycast(world, head, [-look[0], -look[1], -look[2]], 3.6)
        const distance = Math.max(0.4, (hit?.distance ?? 3.6) - 0.25)
        eye.set(head[0] - look[0] * distance, head[1] - look[1] * distance + 0.15, head[2] - look[2] * distance)
        center.set(head[0], head[1] + 0.15, head[2])
      } else {
        eye.set(head[0], head[1], head[2])
        center.set(head[0] + look[0], head[1] + look[1], head[2] + look[2])
      }
      memory.settle += dt
      // Glide in from the menu or architect view, then follow the head exactly.
      if (memory.settle > 0.7 || camera.position.distanceTo(eye) < 0.05) smooth = 1
    }

    const lens = camera as PerspectiveCamera
    const fov = exploring && !viewMode.third ? state.settings.fov : 43
    if (Math.abs(lens.fov - fov) > 0.05) {
      lens.fov = MathUtils.lerp(lens.fov, fov, state.settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 6))
      lens.updateProjectionMatrix()
    }
    camera.position.lerp(eye, smooth)
    focus.current.lerp(center, smooth)
    camera.lookAt(focus.current)
    camera.updateMatrixWorld()
    const direction = camera.getWorldDirection(projection.current)
    const angle = Math.round(MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z)) - 45)
    if (angle !== heading.current && stageElement.current) {
      stageElement.current.style.setProperty('--heading', `${angle}deg`)
      heading.current = angle
    }

    if (marker.current) {
      const [x, , z] = useShared.getState().discovered ? tourMarker : siteMarker
      const screen = projection.current.set(x, getWorld().surface(x, z) + 1.7, z).project(camera)
      const visible = screen.z > -1 && screen.z < 1 && Math.abs(screen.x) < 0.93 && Math.abs(screen.y) < 0.90
      marker.current.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) {
        marker.current.style.transform = `translate(${(screen.x + 1) * size.width / 2}px, ${(1 - screen.y) * size.height / 2}px) translate(-50%, -50%)`
      }
    }
  })

  return <Avatar player={player} facing={walk} />
}

function Avatar({ player, facing }: { player: RefObject<Vector3>; facing: RefObject<{ facing: number }> }) {
  const model = useRef<import('three').Group>(null)
  const left = useRef<import('three').Group>(null)
  const right = useRef<import('three').Group>(null)
  useFrame(({ clock }) => {
    if (!model.current || !left.current || !right.current) return
    const state = useGame.getState()
    model.current.visible = state.mode === 'explore' && state.screen === 'game' && viewMode.third
    model.current.position.copy(player.current)
    model.current.rotation.y = facing.current.facing
    const walking = !state.panel && [...keys].some((key) => key !== 'shift')
    const stride = walking && !state.settings.reducedMotion ? Math.sin(clock.elapsedTime * 11) * 0.52 : 0
    left.current.rotation.x = stride
    right.current.rotation.x = -stride
  })
  return (
    <group ref={model}>
      <mesh position={[0, 0.018, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.36, 16]} />
        <meshBasicMaterial color="#393f29" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 0.63, 7]} />
        <meshStandardMaterial color="#e8dfbc" />
      </mesh>
      <mesh position={[0, 0.79, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.28, 0.10, 7]} />
        <meshStandardMaterial color="#9b5740" />
      </mesh>
      <mesh position={[0, 1.34, 0.005]} castShadow>
        <boxGeometry args={[0.30, 0.31, 0.28]} />
        <meshStandardMaterial color="#c89064" />
      </mesh>
      <mesh position={[0, 1.50, -0.025]} castShadow>
        <boxGeometry args={[0.32, 0.105, 0.30]} />
        <meshStandardMaterial color="#553f2d" />
      </mesh>
      <mesh position={[0, 1.05, -0.22]} rotation-z={0.12} castShadow>
        <boxGeometry args={[0.30, 0.36, 0.19]} />
        <meshStandardMaterial color="#a77549" />
      </mesh>
      {[left, right].map((leg, index) => (
        <group key={index} ref={leg} position={[index ? 0.135 : -0.135, 0.60, 0]}>
          <mesh position={[0, -0.27, 0.02]} castShadow>
            <boxGeometry args={[0.15, 0.49, 0.16]} />
            <meshStandardMaterial color="#a77451" />
          </mesh>
          <mesh position={[0, -0.52, 0.065]}>
            <boxGeometry args={[0.17, 0.10, 0.24]} />
            <meshStandardMaterial color="#614938" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
