import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending, BufferGeometry, CircleGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, HemisphereLight,
  Mesh, MeshBasicMaterial, Points, PointsMaterial,
} from 'three'
import { advance, daylight, dusk, FIXED_TIME, sky, sunDirection } from '../game/daylight'
import { useGame } from '../game/store'
import { viewDistance } from './view'
import { playerState } from './player'
import { submerged } from '../voxel/flow'
import { OY, S, bx, bz, getWorld } from '../voxel/world'

const underwaterColor = new Color('#2c6873')

const palette = {
  day: new Color('#c3dedb'), dusk: new Color('#e8b48c'), night: new Color('#18213a'),
  fogDay: new Color('#c0d6cd'), fogDusk: new Color('#d9a988'), fogNight: new Color('#1d2741'),
  sun: new Color('#ffe4b7'), sunset: new Color('#ffad73'), moon: new Color('#a9bde8'),
  hemiDay: new Color('#fff1d3'), hemiNight: new Color('#7286ba'), groundDay: new Color('#b7a88c'), groundNight: new Color('#2f3546'),
}
const scratch = new Color()

function starField() {
  const positions: number[] = []
  let seed = 4242
  const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 700; i++) {
    const theta = rng() * Math.PI * 2, y = 0.08 + rng() * 0.92, r = Math.sqrt(1 - y * y)
    positions.push(Math.cos(theta) * r * 200, y * 200, Math.sin(theta) * r * 200)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

/**
 * Sun, moon, stars, sky colour, fog and the two lights. One directional light follows the
 * sun by day and the moon by night, so shadows keep working after dark.
 */
export function Sky({ shadows, distance }: { shadows: boolean; distance: number }) {
  const { scene } = useThree()
  const light = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const saved = useRef(0)
  const parts = useMemo(() => {
    const sunMaterial = new MeshBasicMaterial({ color: '#fff3c9', fog: false, toneMapped: false })
    const moonMaterial = new MeshBasicMaterial({ color: '#e9eef8', fog: false, toneMapped: false, transparent: true })
    const starMaterial = new PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false, blending: AdditiveBlending })
    return {
      sun: new Mesh(new CircleGeometry(7, 20), sunMaterial),
      moon: new Mesh(new CircleGeometry(4.5, 20), moonMaterial),
      stars: new Points(starField(), starMaterial),
      background: new Color(palette.day),
      fog: new Fog(palette.fogDay, 31, 114),
    }
  }, [])

  useEffect(() => {
    const { background, fog, sun, moon, stars } = parts
    const previous = { background: scene.background, fog: scene.fog }
    scene.background = background
    scene.fog = fog
    scene.add(sun, moon, stars)
    sky.time = useGame.getState().progress.time
    return () => {
      scene.remove(sun, moon, stars)
      scene.background = previous.background
      scene.fog = previous.fog
      sun.geometry.dispose(); moon.geometry.dispose(); stars.geometry.dispose()
      ;(sun.material as MeshBasicMaterial).dispose(); (moon.material as MeshBasicMaterial).dispose(); (stars.material as PointsMaterial).dispose()
    }
  }, [parts, scene])

  useFrame(({ camera }, elapsed) => {
    const state = useGame.getState()
    const playing = state.screen === 'game'
    const running = playing && state.settings.dayCycle && state.panel !== 'pause' && state.mode !== 'tour'
    if (running) {
      sky.time = advance(sky.time, Math.min(elapsed, 0.1))
      if (daylight(sky.time) < 0.25 && state.mode === 'explore') state.learn('night')
      saved.current += elapsed
      if (saved.current > 5) {
        saved.current = 0
        useGame.getState().setTime(sky.time)
      }
    }
    // The menu and a switched-off cycle always show the same clear morning.
    const time = playing && state.settings.dayCycle ? sky.time : FIXED_TIME
    const day = daylight(time), warm = dusk(time)
    sky.daylight = day

    const [sx, sy, sz] = sunDirection(time)
    const { background, fog, sun, moon, stars } = parts
    background.copy(palette.night).lerp(palette.day, day).lerp(palette.dusk, warm * 0.75)
    fog.color.copy(palette.fogNight).lerp(palette.fogDay, day).lerp(palette.fogDusk, warm * 0.7)
    // A short view distance pulls the fog in so hidden chunks fade out instead of popping.
    const range = viewDistance(distance)
    fog.far = Math.min(114 - (1 - day) * 34, range)
    fog.near = Math.min(31 - (1 - day) * 8, fog.far * 0.45)
    // Under water the world closes in to a murky blue-green.
    const c0 = camera.position
    if (playing && state.mode === 'explore' && submerged((x, y, z) => getWorld().get(x, y, z), bx(c0.x), c0.y / S + OY, bz(c0.z))) {
      fog.color.copy(underwaterColor).multiplyScalar(0.35 + day * 0.65)
      background.copy(fog.color)
      fog.near = 0.2
      fog.far = 9
    }

    // Discs stay a fixed distance from the camera so they never come closer when walking.
    const c = camera.position
    sun.position.set(c.x + sx * 150, c.y + sy * 150, c.z + sz * 150)
    sun.lookAt(c)
    sun.visible = sy > -0.12
    moon.position.set(c.x - sx * 150, c.y - sy * 150, c.z - sz * 150)
    moon.lookAt(c)
    moon.visible = sy < 0.12
    stars.position.copy(c)
    ;(stars.material as PointsMaterial).opacity = Math.max(0, 1 - day * 1.6) * 0.9

    if (hemi.current) {
      hemi.current.intensity = 0.5 + day * 1.24
      hemi.current.color.copy(palette.hemiNight).lerp(palette.hemiDay, day)
      hemi.current.groundColor.copy(palette.groundNight).lerp(palette.groundDay, day)
    }
    if (light.current) {
      const up = sy > -0.04
      const height = up ? sy : -sy
      const strength = Math.min(1, Math.max(0, (height + 0.02) / 0.17))
      const sign = up ? 1 : -1
      light.current.position.set(sx * sign * 30, Math.max(4, sy * sign * 30), sz * sign * 30)
      light.current.intensity = up ? 2.45 * strength : 0.5 * strength
      light.current.color.copy(up ? scratch.copy(palette.sun).lerp(palette.sunset, warm) : palette.moon)
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#fff1d3', '#b7a88c', 1.74]} />
      <directionalLight ref={light} position={[-13, 22, 10]} intensity={2.45} color="#ffe4b7" castShadow={shadows}
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={62} shadow-normalBias={0.065} />
    </>
  )
}
