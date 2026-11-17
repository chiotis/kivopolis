import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial } from 'three'
import { sharedAtlas } from '../voxel/atlas'
import { sky } from '../game/daylight'
import { meshChunk, meshWater } from '../voxel/mesher'
import { useGame } from '../game/store'
import { animateWater, flowingWaterMaterial } from './water'
import { CHUNK, CX, CZ, S, WATER_TICK, getWorld, wx, wz } from '../voxel/world'
import { CHUNK_RADIUS, viewDistance } from './view'

/** Milliseconds of meshing per frame. Chunks nearest the camera go first, so a new world fills in from where the player stands. */
const BUDGET_MS = 8

function buildGeometry(cx: number, cz: number, ao: boolean) {
  const mesh = meshChunk(getWorld(), cx, cz, { ao })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
  geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3))
  geometry.setAttribute('blockLight', new BufferAttribute(mesh.lights, 1))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

function buildWater(cx: number, cz: number) {
  const mesh = meshWater(getWorld(), cx, cz)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
  geometry.setAttribute('flow', new BufferAttribute(mesh.flows, 2))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * The island as one mesh per 16 × 16 chunk, plus a see-through water mesh drawn after it. three.js skips chunks outside the camera frustum by
 * their bounding spheres; chunks beyond the view distance (low quality) are hidden as well.
 */
export function VoxelTerrain({ shadows, distance, ao }: { shadows: boolean; distance: number; ao: boolean }) {
  const group = useRef<Group>(null)
  const lamp = useMemo(() => ({ value: 0.4 }), [])
  const material = useMemo(() => {
    const result = new MeshLambertMaterial({ map: sharedAtlas(), vertexColors: true, alphaTest: 0.5 })
    // Lamp light is added as warm emission, strongest at night, so lit blocks glow in the dark.
    result.onBeforeCompile = (shader) => {
      shader.uniforms.uLamp = lamp
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float blockLight;\nvarying float vBlockLight;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlockLight = blockLight;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLamp;\nvarying float vBlockLight;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.7, 0.4) * pow(vBlockLight, 2.0) * uLamp;')
    }
    return result
  }, [lamp])
  const meshes = useRef<Mesh[]>([])
  const waters = useRef<Mesh[]>([])
  const dirty = useRef(new Set<number>())
  const smooth = useRef(ao)
  /** Game time not yet spent on water ticks. */
  const waterClock = useRef(0)

  useEffect(() => {
    const root = group.current!
    const world = getWorld()
    const list: Mesh[] = []
    const seas: Mesh[] = []
    for (let cz = 0; cz < CZ; cz++) {
      for (let cx = 0; cx < CX; cx++) {
        // Every chunk starts empty and is meshed over the next frames, nearest first.
        dirty.current.add(cz * CX + cx)
        const mesh = new Mesh(new BufferGeometry(), material)
        mesh.receiveShadow = true
        mesh.name = `chunk-${cx}-${cz}`
        list.push(mesh)
        root.add(mesh)
        const water = new Mesh(new BufferGeometry(), flowingWaterMaterial())
        water.renderOrder = 1
        water.name = `water-${cx}-${cz}`
        seas.push(water)
        root.add(water)
      }
    }
    meshes.current = list
    waters.current = seas
    const unsubscribe = world.subscribe((chunks) => { for (const chunk of chunks) dirty.current.add(chunk) })
    return () => {
      unsubscribe()
      for (const mesh of [...list, ...seas]) {
        root.remove(mesh)
        mesh.geometry.dispose()
      }
      meshes.current = []
      waters.current = []
    }
  }, [material])

  useEffect(() => {
    for (const mesh of meshes.current) mesh.castShadow = shadows
  }, [shadows])

  useEffect(() => () => { material.dispose() }, [material])

  // Switching ambient occlusion re-meshes every chunk, a few per frame.
  useEffect(() => {
    if (smooth.current === ao) return
    smooth.current = ao
    for (let chunk = 0; chunk < CX * CZ; chunk++) dirty.current.add(chunk)
  }, [ao])

  useFrame(({ camera }, elapsed) => {
    lamp.value = 0.3 + (1 - sky.daylight) * 2.1
    animateWater(Math.min(elapsed, 0.1), useGame.getState().settings.reducedMotion)
    // Water runs in fixed ticks, at most two per frame so a slow frame does not pile them up.
    const world = getWorld()
    if (world.flowing) {
      waterClock.current = Math.min(waterClock.current + Math.min(elapsed, 0.1), WATER_TICK * 2)
      while (waterClock.current >= WATER_TICK) {
        waterClock.current -= WATER_TICK
        world.tickWater()
      }
    } else waterClock.current = 0
    const range = viewDistance(distance) + CHUNK_RADIUS
    const half = (CHUNK * S) / 2
    for (let chunk = 0; chunk < meshes.current.length; chunk++) {
      const cx = chunk % CX, cz = Math.floor(chunk / CX)
      const dx = wx(cx * CHUNK) + half - camera.position.x, dz = wz(cz * CHUNK) + half - camera.position.z
      const visible = dx * dx + dz * dz <= range * range
      meshes.current[chunk].visible = visible
      if (waters.current[chunk]) waters.current[chunk].visible = visible
    }
    if (!dirty.current.size) return
    const farness = (chunk: number) => {
      const dx = wx((chunk % CX) * CHUNK) + half - camera.position.x, dz = wz(Math.floor(chunk / CX) * CHUNK) + half - camera.position.z
      return dx * dx + dz * dz
    }
    const queue = [...dirty.current].sort((a, b) => farness(a) - farness(b))
    const start = performance.now()
    for (const chunk of queue) {
      // Always at least one chunk per frame, then as many as fit in the budget.
      if (chunk !== queue[0] && performance.now() - start > BUDGET_MS) break
      dirty.current.delete(chunk)
      const mesh = meshes.current[chunk]
      if (!mesh) continue
      mesh.geometry.dispose()
      mesh.geometry = buildGeometry(chunk % CX, Math.floor(chunk / CX), smooth.current)
      const water = waters.current[chunk]
      if (water) {
        water.geometry.dispose()
        water.geometry = buildWater(chunk % CX, Math.floor(chunk / CX))
      }
    }
  })

  return <group ref={group} />
}
