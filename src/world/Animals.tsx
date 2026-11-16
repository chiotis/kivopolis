import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, Group, Mesh, MeshLambertMaterial } from 'three'
import { isNight, sky } from '../game/daylight'
import { useGame } from '../game/store'
import { type Animal, type AnimalKind } from './wildlife'
import { ensureHerd, stepHerd } from './herd'

type Part = 'body' | 'head' | 'leg' | 'wool' | 'detail'
interface Piece { part: Part; size: [number, number, number]; at: [number, number, number]; color: string; tilt?: number }

const leg = (x: number, z: number, height: number, width: number, color: string): Piece =>
  ({ part: 'leg', size: [width, height, width], at: [x, height / 2, z], color })

/** Blocky models built from boxes; the front of each animal faces +z. */
const models: Record<AnimalKind, Piece[]> = {
  sheep: [
    { part: 'wool', size: [0.56, 0.48, 0.84], at: [0, 0.58, 0], color: '#eee8da' },
    { part: 'body', size: [0.42, 0.34, 0.72], at: [0, 0.56, 0], color: '#d8c0a0' },
    { part: 'head', size: [0.28, 0.3, 0.3], at: [0, 0.78, 0.5], color: '#4f4237' },
    { part: 'detail', size: [0.3, 0.12, 0.2], at: [0, 0.93, 0.46], color: '#eee8da' },
    leg(-0.17, 0.27, 0.36, 0.13, '#4f4237'), leg(0.17, 0.27, 0.36, 0.13, '#4f4237'),
    leg(-0.17, -0.27, 0.36, 0.13, '#4f4237'), leg(0.17, -0.27, 0.36, 0.13, '#4f4237'),
  ],
  goat: [
    { part: 'body', size: [0.4, 0.38, 0.72], at: [0, 0.62, 0], color: '#9b7a5a' },
    { part: 'detail', size: [0.41, 0.14, 0.5], at: [0, 0.47, 0], color: '#e8e0cf' },
    { part: 'head', size: [0.24, 0.28, 0.32], at: [0, 0.88, 0.46], color: '#a8896a' },
    { part: 'detail', size: [0.05, 0.2, 0.05], at: [-0.07, 1.07, 0.38], color: '#d8cdb8', tilt: -0.5 },
    { part: 'detail', size: [0.05, 0.2, 0.05], at: [0.07, 1.07, 0.38], color: '#d8cdb8', tilt: -0.5 },
    { part: 'detail', size: [0.06, 0.12, 0.06], at: [0, 0.69, 0.58], color: '#e8e0cf' },
    leg(-0.14, 0.26, 0.44, 0.11, '#6e543f'), leg(0.14, 0.26, 0.44, 0.11, '#6e543f'),
    leg(-0.14, -0.26, 0.44, 0.11, '#6e543f'), leg(0.14, -0.26, 0.44, 0.11, '#6e543f'),
  ],
  chicken: [
    { part: 'body', size: [0.26, 0.24, 0.32], at: [0, 0.3, 0], color: '#f4f1ea' },
    { part: 'detail', size: [0.3, 0.14, 0.2], at: [0, 0.31, -0.02], color: '#ddd8cc' },
    { part: 'head', size: [0.15, 0.2, 0.14], at: [0, 0.48, 0.13], color: '#f4f1ea' },
    { part: 'detail', size: [0.08, 0.05, 0.08], at: [0, 0.47, 0.23], color: '#e3a33a' },
    { part: 'detail', size: [0.04, 0.07, 0.1], at: [0, 0.6, 0.13], color: '#c8352a' },
    { part: 'detail', size: [0.05, 0.06, 0.04], at: [0, 0.42, 0.21], color: '#c8352a' },
    leg(-0.06, 0, 0.18, 0.04, '#e0a24a'), leg(0.06, 0, 0.18, 0.04, '#e0a24a'),
  ],
}

interface Rig { group: Group; legs: Mesh[]; wool?: Mesh; head?: Mesh }

/** Sheep, goats and chickens wandering the meadows; they rest at night. */
export function Animals({ shadows }: { shadows: boolean }) {
  const root = useRef<Group>(null)
  const rigs = useRef(new Map<number, Rig>())
  const assets = useMemo(() => ({ geometry: new BoxGeometry(1, 1, 1), materials: new Map<string, MeshLambertMaterial>() }), [])

  useEffect(() => {
    const group = root.current!
    const material = (color: string) => {
      let result = assets.materials.get(color)
      if (!result) { result = new MeshLambertMaterial({ color: new Color(color) }); assets.materials.set(color, result) }
      return result
    }
    for (const animal of ensureHerd()) {
      const rig: Rig = { group: new Group(), legs: [] }
      for (const piece of models[animal.kind]) {
        const mesh = new Mesh(assets.geometry, material(piece.color))
        mesh.scale.set(...piece.size)
        mesh.position.set(...piece.at)
        if (piece.tilt) mesh.rotation.x = piece.tilt
        mesh.castShadow = shadows
        if (piece.part === 'leg') {
          // Pivot legs at the hip so they swing from the top.
          const hip = new Group()
          hip.position.set(piece.at[0], piece.size[1], piece.at[2])
          mesh.position.set(0, -piece.size[1] / 2, 0)
          hip.add(mesh)
          rig.group.add(hip)
          rig.legs.push(mesh)
          continue
        }
        if (piece.part === 'wool') rig.wool = mesh
        if (piece.part === 'head') rig.head = mesh
        rig.group.add(mesh)
      }
      rig.group.name = `${animal.kind}-${animal.id}`
      group.add(rig.group)
      rigs.current.set(animal.id, rig)
    }
    const current = rigs.current
    return () => {
      for (const rig of current.values()) group.remove(rig.group)
      current.clear()
    }
  }, [assets, shadows])

  useEffect(() => () => {
    assets.geometry.dispose()
    for (const material of assets.materials.values()) material.dispose()
  }, [assets])

  useFrame(({ clock }, elapsed) => {
    const state = useGame.getState()
    const dt = Math.min(elapsed, 0.05)
    const paused = state.screen !== 'game' || state.panel === 'pause'
    const night = isNight(state.settings.dayCycle && state.screen === 'game' ? sky.time : 0.4)
    if (!paused) stepHerd(dt, night)
    for (const animal of ensureHerd()) {
      const rig = rigs.current.get(animal.id)
      if (!rig) continue
      place(rig, animal, clock.elapsedTime, state.settings.reducedMotion)
    }
  })

  return <group ref={root} />
}

function place(rig: Rig, animal: Animal, time: number, calm: boolean) {
  const hop = animal.hurt > 0 ? Math.sin((animal.hurt / 0.35) * Math.PI) * 0.18 : 0
  rig.group.position.set(animal.x, animal.y + hop, animal.z)
  rig.group.rotation.y = animal.yaw
  const swing = calm || !animal.walking ? 0 : Math.sin(animal.stride) * 0.6
  // Diagonal pairs move together: front-left with back-right.
  const phase = rig.legs.length === 2 ? [1, -1] : [1, -1, -1, 1]
  rig.legs.forEach((mesh, i) => { mesh.parent!.rotation.x = phase[i] * swing })
  if (rig.wool) rig.wool.visible = animal.sheared <= 0
  // Grazing: the head dips now and then while standing.
  if (rig.head && !calm) rig.head.rotation.x = animal.walking ? 0 : Math.max(0, Math.sin(time * 0.7 + animal.id * 1.7)) * 0.55
}
