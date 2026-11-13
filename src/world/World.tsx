import { Component, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { MathUtils, Vector3 } from 'three'
import { Landmark } from 'lucide-react'
import { copy } from '../game/el'
import { useGame } from '../game/store'
import { CameraRig, initialView } from './camera'
import { SceneInput } from './input'
import { BlockInteraction } from './BlockInteraction'
import { Drops } from './Drops'
import { Landscape } from './landscape'
import { VoxelTerrain } from './VoxelTerrain'
import { HeldItem } from './HeldItem'
import { SiteGuide } from './SiteGuide'

function Fallback() {
  return (
    <div className="world-fallback" role="alert">
      <Landmark size={38} />
      <strong>{copy.worldError}</strong><span>{copy.webgl}</span>
      <button className="button" onClick={() => window.location.reload()}>{copy.reload}</button>
    </div>
  )
}

class WorldBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Fallback /> : this.props.children }
}

export function World({ blueprint, marker }: { blueprint: boolean; marker: RefObject<HTMLDivElement | null> }) {
  const view = useRef(initialView())
  const [x, , z] = useGame.getState().progress.player
  const player = useRef(new Vector3(x, 0, z))
  const quality = useGame((state) => state.settings.quality)
  const [factor, setFactor] = useState(0.72)
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const dpr = quality === 'low' ? 1 : quality === 'high' ? Math.min(devicePixelRatio, 1.75)
    : Math.min(devicePixelRatio, MathUtils.lerp(0.85, coarse ? 1.22 : 1.55, factor))
  const shadows = quality === 'high' || (quality === 'auto' && !coarse)
  return (
    <WorldBoundary>
      <Canvas aria-label={copy.visual} fallback={<Fallback />} dpr={dpr} shadows={shadows}
        camera={{ position: [12, 11.9, 23.5], fov: 43, near: 0.05, far: 270 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}>
        {quality === 'auto' && <PerformanceMonitor onChange={({ factor: value }) => setFactor(value)} />}
        <color attach="background" args={['#c3dedb']} />
        <fog attach="fog" args={['#c0d6cd', 31, 114]} />
        <hemisphereLight args={['#fff1d3', '#b7a88c', 1.74]} />
        <directionalLight position={[-13, 22, 10]} intensity={2.45} color="#ffe4b7" castShadow={shadows}
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30}
          shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={62} shadow-normalBias={0.065} />
        <Landscape />
        <VoxelTerrain shadows={shadows} />
        <BlockInteraction />
        <Drops />
        <SiteGuide blueprint={blueprint} />
        <CameraRig view={view} player={player} marker={marker} />
        <SceneInput view={view} />
        <HeldItem />
      </Canvas>
    </WorldBoundary>
  )
}
