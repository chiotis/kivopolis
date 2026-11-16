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
import { Sky } from './Sky'
import { Animals } from './Animals'
import { SiteGuide } from './SiteGuide'
import { Capture } from './Capture'

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
  // View distance in world units (the island is 72 across) and corner shading follow quality.
  const distance = quality === 'low' ? 44 : quality === 'auto' && coarse ? 60 : Infinity
  const ao = quality !== 'low'
  return (
    <WorldBoundary>
      <Canvas aria-label={copy.visual} fallback={<Fallback />} dpr={dpr} shadows={shadows}
        camera={{ position: [12, 11.9, 23.5], fov: 43, near: 0.05, far: 420 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}>
        {quality === 'auto' && <PerformanceMonitor onChange={({ factor: value }) => setFactor(value)} />}
        <Sky shadows={shadows} distance={distance} />
        <Landscape />
        <VoxelTerrain shadows={shadows} distance={distance} ao={ao} />
        <BlockInteraction />
        <Drops />
        <Animals shadows={shadows} />
        <SiteGuide blueprint={blueprint} />
        <CameraRig view={view} player={player} marker={marker} />
        <SceneInput view={view} />
        <HeldItem />
        <Capture />
      </Canvas>
    </WorldBoundary>
  )
}
