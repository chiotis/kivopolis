import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry, BufferGeometry, Color, DodecahedronGeometry, Float32BufferAttribute, InstancedMesh,
  LineBasicMaterial, Object3D,
} from 'three'
import { useGame } from '../game/store'
import { islandEdge } from '../game/terrain'
import { siteMarker, tourMarker, type Point } from '../game/theatre'
import { getWorld } from '../voxel/world'

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
  for (let i = 0; i < 2600; i++) {
    const x = (rng() - 0.5) * 230, z = (rng() - 0.64) * 220
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

export function Landscape() {
  const waves = useMemo(waterLines, [])
  const waveMaterial = useRef<LineBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (waveMaterial.current) {
      waveMaterial.current.opacity = useGame.getState().settings.reducedMotion
        ? 0.42 : 0.40 + Math.sin(clock.elapsedTime * 0.85) * 0.07
    }
  })
  useEffect(() => () => { waves.dispose() }, [waves])
  return (
    <>
      <mesh position={[0, -0.76, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[580, 580]} />
        <meshStandardMaterial color="#488894" roughness={0.66} />
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

const islets: Instance[] = [
  { p: [-30, -1.6, -41], s: [16, 5.5, 7.3], r: [0, 0.24, 0], color: '#7c987f' },
  { p: [-39, -1.9, -45], s: [10.2, 6.8, 9], r: [0, 0.65, 0], color: '#819b83' },
  { p: [-2, -2.2, -49], s: [7.4, 5.2, 5.6], color: '#829987' },
  { p: [15, -2.4, -60], s: [17, 7.3, 7.6], r: [0, -0.3, 0], color: '#819b8e' },
  { p: [-52, -2.4, -4], s: [10, 6.3, 7.6], r: [0, 0.2, 0], color: '#7e9d8d' },
  { p: [-76, -1.9, -32], s: [24, 11, 10], color: '#91a9a0' },
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
