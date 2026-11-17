import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { BoxGeometry, Color, EdgesGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, BufferGeometry, Float32BufferAttribute } from 'three'
import { cells } from '../game/blueprints/theatre'
import { activeStep, plans, usePlans } from '../game/plans'
import { activeMission, useSite } from '../game/site'
import { useGame, useShared } from '../game/store'
import { blocks } from '../voxel/blocks'
import { S, wx, wy, wz } from '../voxel/world'

const matrix = new Matrix4()
const tint = new Color()
const white = new Color('#ffffff')
const glow = new Color('#ffe2a0')

type Placed = { x: number; y: number; z: number; block: number }

/** Merges the edges of many cubes into one line mesh: crisp outlines without instancing lines. */
function outlineGeometry(list: readonly Placed[], indices: number[], grow: number) {
  const edge = new EdgesGeometry(new BoxGeometry(S * grow, S * grow, S * grow)).getAttribute('position')
  const positions = new Float32Array(indices.length * edge.count * 3)
  indices.forEach((i, n) => {
    const { x, y, z } = list[i]
    const cx = wx(x) + S / 2, cy = wy(y) + S / 2, cz = wz(z) + S / 2
    for (let v = 0; v < edge.count; v++) {
      const o = (n * edge.count + v) * 3
      positions[o] = edge.getX(v) + cx
      positions[o + 1] = edge.getY(v) + cy
      positions[o + 2] = edge.getZ(v) + cz
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

/**
 * Ghost blocks of a blueprint: `strong` cells glow in their material's colour, `faint` ones show
 * the whole plan softly, and `wrong` cells (a block that does not belong) are outlined in red.
 */
function Ghosts({ list, strong, faint, wrong }: { list: readonly Placed[]; strong: number[]; faint: number[]; wrong: number[] }) {
  const ghosts = useRef<InstancedMesh>(null)
  const reducedMotion = useGame((state) => state.settings.reducedMotion)
  const assets = useMemo(() => ({
    box: new BoxGeometry(S * 0.94, S * 0.94, S * 0.94),
    ghost: new MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false }),
    line: new LineBasicMaterial({ color: '#f3b443', transparent: true, opacity: 0.9, depthWrite: false }),
    wrong: new LineBasicMaterial({ color: '#d2402c', depthTest: false, transparent: true, opacity: 0.95 }),
  }), [])

  useEffect(() => {
    const mesh = ghosts.current
    if (!mesh) return
    let n = 0
    for (const [indices, strength] of [[strong, 1], [faint, 0.35]] as const) {
      for (const i of indices) {
        const { x, y, z, block } = list[i]
        matrix.makeTranslation(wx(x) + S / 2, wy(y) + S / 2, wz(z) + S / 2)
        mesh.setMatrixAt(n, matrix)
        tint.set(blocks[block].color).lerp(strength === 1 ? glow : white, strength === 1 ? 0.45 : 0.6)
        mesh.setColorAt(n, tint)
        n++
      }
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [list, strong, faint])

  const outline = useMemo(() => outlineGeometry(list, strong, 0.96), [list, strong])
  const misplaced = useMemo(() => outlineGeometry(list, wrong, 1.06), [list, wrong])
  useEffect(() => () => outline.dispose(), [outline])
  useEffect(() => () => misplaced.dispose(), [misplaced])

  useFrame(({ clock }) => {
    const pulse = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 2.4)
    assets.ghost.opacity = 0.46 + pulse * 0.08
    assets.line.opacity = 0.78 + pulse * 0.18
  })

  return (
    <>
      <instancedMesh args={[assets.box, assets.ghost, list.length]} ref={ghosts} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={outline} material={assets.line} renderOrder={1} />
      <lineSegments geometry={misplaced} material={assets.wrong} renderOrder={4} />
    </>
  )
}

/**
 * Ghost blocks of the theatre blueprint. The current mission's missing blocks glow in their
 * material's colour; a block that does not belong in a cell is outlined in red. The overview
 * camera (and the menu) can show the whole plan faintly.
 */
export function SiteGuide({ blueprint }: { blueprint: boolean }) {
  const { missing, wrong, counts } = useSite()
  const { discovered, screen, mode } = useGame(useShallow((state) => ({
    discovered: useShared.getState().discovered, screen: state.screen, mode: state.mode,
  })))
  const mission = activeMission(discovered, counts)

  // Which missing cells to show: the current mission while playing, everything when the plan is on.
  const shown = useMemo(() => {
    const all = screen === 'menu' || (mode === 'overview' && blueprint)
    if (!discovered && !all) return { strong: [] as number[], faint: [] as number[] }
    const strong = discovered ? missing.filter((i) => cells[i].mission === mission) : []
    const faint = all ? missing.filter((i) => cells[i].mission !== mission || !discovered) : []
    return { strong, faint }
  }, [missing, discovered, mission, screen, mode, blueprint])
  const misplaced = useMemo(() => discovered && screen === 'game' ? wrong.filter((i) => cells[i].mission === mission) : [],
    [wrong, discovered, screen, mission])

  return <>
    <Ghosts list={cells} strong={shown.strong} faint={shown.faint} wrong={misplaced} />
    {plans.map((plan) => <PlanGuide key={plan.id} plan={plan} blueprint={blueprint} />)}
  </>
}

/** The same guide for a building after the theatre, once its signpost has been read. */
function PlanGuide({ plan, blueprint }: { plan: (typeof plans)[number]; blueprint: boolean }) {
  const site = usePlans((state) => state.sites[plan.id])
  const discovered = useShared((state) => state.buildings[plan.id]?.discovered ?? false)
  const { screen, mode } = useGame(useShallow((state) => ({ screen: state.screen, mode: state.mode })))
  const shown = useMemo(() => {
    if (!site || !discovered || screen !== 'game') return { strong: [] as number[], faint: [] as number[], wrong: [] as number[] }
    const step = activeStep(plan, site.counts)
    const all = mode === 'overview' && blueprint
    return {
      strong: site.missing.filter((i) => plan.cells[i].step === step),
      faint: all ? site.missing.filter((i) => plan.cells[i].step !== step) : [],
      wrong: site.wrong.filter((i) => plan.cells[i].step === step),
    }
  }, [site, discovered, screen, mode, blueprint, plan])
  return <Ghosts list={plan.cells} strong={shown.strong} faint={shown.faint} wrong={shown.wrong} />
}
