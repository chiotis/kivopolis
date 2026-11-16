import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry, BufferGeometry, Color, DodecahedronGeometry, Float32BufferAttribute, InstancedMesh,
  LineBasicMaterial, Object3D, Path, Shape, ShapeGeometry,
} from 'three'
import { useGame } from '../game/store'
import { sky } from '../game/daylight'
import { islandEdge } from '../game/terrain'
import { siteMarker, tourMarker, type Point } from '../game/theatre'
import { S, SEA_FLOOR_Y, SEA_LEVEL, SX, SZ, getWorld, wx, wy, wz } from '../voxel/world'
import { waterMaterial } from './water'

function random(seed: number) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
}

const rock = new DodecahedronGeometry(1, 0)
const cube = new BoxGeometry()
type Instance = { p: Point; s: Point; r?: Point; color: string }

function Batch({ geometry, items, shadows = false }: { geometry: BufferGeometry; items: Instance[]; shadows?: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  useEffect(() => {
    const current = mesh.current
    if (!current) return
    const transform = new Object3D()
    const color = new Color()
    items.forEach(({ p, s, r = [0, 0, 0], color: tint }, index) => {
      transform.position.set(...p)
      transform.scale.set(...s)
      transform.rotation.set(...r)
      transform.updateMatrix()
      current.setMatrixAt(index, transform.matrix)
      current.setColorAt(index, color.set(tint))
    })
    current.instanceMatrix.needsUpdate = true
    if (current.instanceColor) current.instanceColor.needsUpdate = true
    current.computeBoundingSphere()
  }, [items])
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, items.length]} castShadow={shadows} receiveShadow dispose={null}>
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  )
}

function waterLines() {
  const rng = random(333)
  const positions: number[] = []
  const colors: number[] = []
  const tint = new Color('#a9dce0')
  for (let i = 0; i < 6000; i++) {
    const x = (rng() - 0.5) * 420, z = (rng() - 0.5) * 420
    if (Math.hypot(x, z) < islandEdge(Math.atan2(x, -z)) + 1.5) continue
    const w = 0.32 + rng() * 2.15
    positions.push(x - w, -0.735, z, x + w, -0.735, z + 0.08)
    colors.push(tint.r, tint.g, tint.b, tint.r * 0.52, tint.g * 0.7, tint.b * 0.8)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

/**
 * The open sea beyond the block world: a square of water with a hole exactly over the grid,
 * where the voxel water takes over. UVs are in blocks, so the ripples match at the border.
 */
function outerSea() {
  const far = 290
  const shape = new Shape().moveTo(-far, -far).lineTo(far, -far).lineTo(far, far).lineTo(-far, far).closePath() as Shape
  const [x0, x1, z0, z1] = [wx(0), wx(SX), wz(0), wz(SZ)]
  // Shape y is world -z once the plane is laid flat (three.js orders the hole's winding itself).
  shape.holes.push(new Path().moveTo(x0, -z1).lineTo(x0, -z0).lineTo(x1, -z0).lineTo(x1, -z1).closePath())
  const geometry = new ShapeGeometry(shape)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / S, uv.getY(i) / S)
  return geometry
}

export function Landscape() {
  const waves = useMemo(waterLines, [])
  const sea = useMemo(outerSea, [])
  const waveMaterial = useRef<LineBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (waveMaterial.current) {
      const wave = useGame.getState().settings.reducedMotion ? 0.42 : 0.40 + Math.sin(clock.elapsedTime * 0.85) * 0.07
      waveMaterial.current.opacity = wave * (0.25 + sky.daylight * 0.75)
    }
  })
  useEffect(() => () => { waves.dispose(); sea.dispose() }, [waves, sea])
  return (
    <>
      <mesh geometry={sea} material={waterMaterial()} position={[0, SEA_LEVEL, 0]} rotation-x={-Math.PI / 2} renderOrder={1} />
      {/* The sea floor continues level with the voxel floor at the grid's edge; inside, terrain covers it. */}
      <mesh position={[0, wy(SEA_FLOOR_Y + 1) - 0.01, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[580, 580]} />
        <meshStandardMaterial color="#3d7178" roughness={1} />
      </mesh>
      <lineSegments geometry={waves}>
        <lineBasicMaterial ref={waveMaterial} vertexColors transparent opacity={0.42} />
      </lineSegments>
      <DistantIslands />
      <Sign x={siteMarker[0]} z={siteMarker[2]} />
      <Sign x={tourMarker[0]} z={tourMarker[2]} small />
    </>
  )
}

// Islets out at sea, beyond the larger island's shore (radius about 85).
const islets: Instance[] = [
  { p: [-62, -2.2, -118], s: [22, 7.5, 10], r: [0, 0.24, 0], color: '#7c987f' },
  { p: [-86, -2.6, -104], s: [14, 9, 12], r: [0, 0.65, 0], color: '#819b83' },
  { p: [-8, -2.8, -128], s: [11, 7, 8], color: '#829987' },
  { p: [44, -3, -122], s: [24, 10, 11], r: [0, -0.3, 0], color: '#819b8e' },
  { p: [-124, -3, -18], s: [14, 8.5, 11], r: [0, 0.2, 0], color: '#7e9d8d' },
  { p: [-132, -2.6, -74], s: [32, 14, 14], color: '#91a9a0' },
]
function DistantIslands() { return <Batch geometry={rock} items={islets} /> }

function Sign({ x, z, small = false }: { x: number; z: number; small?: boolean }) {
  return (
    <group position={[x, getWorld().surface(x, z), z]} scale={small ? 0.76 : 1} rotation-y={0.17}>
      <mesh position={[0, 0.42, 0]} geometry={cube} scale={[0.45, 0.83, 0.34]} castShadow>
        <meshStandardMaterial color="#b79871" />
      </mesh>
      <mesh position={[0, 0.91, 0]} geometry={cube} scale={[0.78, 0.30, 0.46]} castShadow>
        <meshStandardMaterial color="#d5b887" />
      </mesh>
      <mesh position={[0, 0.94, 0.237]} geometry={cube} scale={[0.60, 0.15, 0.02]}>
        <meshStandardMaterial color="#816348" />
      </mesh>
    </group>
  )
}
