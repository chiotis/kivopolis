import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BoxGeometry, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Group, HemisphereLight, Mesh,
  MeshLambertMaterial, PerspectiveCamera, Scene,
} from 'three'
import { useGame } from '../game/store'
import { sky } from '../game/daylight'
import { useInventory } from '../game/inventory'
import { itemByKey } from '../game/items'
import { blocks } from '../voxel/blocks'
import { sharedAtlas, tilePixels } from '../voxel/atlas'
import { tileUV } from '../voxel/mesher'
import { keys, movementKeys, viewMode } from './camera'
import { blockInput } from './player'

const PX = 16

/** A cube textured like the block it stands for (box faces: +x, -x, +y, -y, +z, -z). */
function cubeModel(blockId: number) {
  const geometry = new BoxGeometry(0.11, 0.11, 0.11)
  const { tiles } = blocks[blockId]
  const faceTiles = [tiles.side, tiles.side, tiles.top, tiles.bottom, tiles.side, tiles.side]
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = tileUV(faceTiles[Math.floor(i / 4)], uv.getX(i), uv.getY(i))
    uv.setXY(i, u, v)
  }
  return geometry
}

/**
 * Turns a 16 × 16 icon into a slab of coloured pixel cubes, one pixel thick, like a
 * hand-held tool in a block game. Faces between two solid pixels are skipped.
 */
function pixelModel(tile: number, size = 0.5) {
  const data = tilePixels(tile)
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < PX && y < PX && data[(y * PX + x) * 4 + 3] > 128
  const positions: number[] = [], normals: number[] = [], colors: number[] = []
  const p = size / PX, depth = p * 1.2
  const color = new Color()
  const quad = (corners: number[][], normal: number[], shade: number) => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(...corners[index])
      normals.push(...normal)
      colors.push(color.r * shade, color.g * shade, color.b * shade)
    }
  }
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      if (!solid(x, y)) continue
      const o = (y * PX + x) * 4
      color.setRGB(data[o] / 255, data[o + 1] / 255, data[o + 2] / 255).convertSRGBToLinear()
      const x0 = (x - PX / 2) * p, x1 = x0 + p
      const y1 = (PX / 2 - y) * p, y0 = y1 - p
      const z0 = -depth / 2, z1 = depth / 2
      quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], 1)
      quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], 0.8)
      if (!solid(x - 1, y)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], 0.7)
      if (!solid(x + 1, y)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], 0.7)
      if (!solid(x, y - 1)) quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], 0.9)
      if (!solid(x, y + 1)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], 0.6)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

/** Where each kind of held thing rests in view space (x right, y up, z towards the viewer). */
const poses = {
  hand: { position: [0.33, -0.3, -0.41], rotation: [-0.85, -0.3, 0.1] },
  block: { position: [0.3, -0.25, -0.5], rotation: [0.15, 0.75, 0] },
  // Mirrored (turned past a half turn) so the handle enters from the lower right and the head leans in.
  tool: { position: [0.26, -0.19, -0.44], rotation: [0.12, 2.4, -0.05] },
  flat: { position: [0.26, -0.21, -0.45], rotation: [0.05, 2.5, 0] },
} as const

/**
 * The item in the selected hotbar slot, drawn at the lower right of the first-person view
 * in its own pass so it never sinks into walls. It bobs while walking and swings to break
 * and place.
 */
export function HeldItem() {
  const { gl, scene, camera, size } = useThree()
  const rig = useMemo(() => {
    const view = new Scene()
    const lens = new PerspectiveCamera(70, 1, 0.01, 10)
    const fill = new HemisphereLight('#fff1d3', '#8a7d68', 2.1)
    view.add(fill)
    const sun = new DirectionalLight('#ffe4b7', 1.6)
    sun.position.set(-1, 2, 1.5)
    view.add(sun)
    const holder = new Group()
    const model = new Mesh()
    holder.add(model)
    view.add(holder)
    return {
      view, lens, holder, model, fill, sun,
      textured: new MeshLambertMaterial({ map: sharedAtlas() }),
      painted: new MeshLambertMaterial({ vertexColors: true }),
      skin: new MeshLambertMaterial({ color: '#c8956a' }),
      arm: new BoxGeometry(0.075, 0.075, 0.34),
      models: new Map<string, BufferGeometry>(),
      // A sentinel item so the first frame always builds the model, even for an empty hand.
      state: { item: '\u0000' as string, equip: 1, swing: 0, walk: 0, lastSwing: 0 },
    }
  }, [])

  useEffect(() => () => {
    for (const geometry of rig.models.values()) geometry.dispose()
    rig.arm.dispose()
    rig.textured.dispose()
    rig.painted.dispose()
    rig.skin.dispose()
  }, [rig])

  useEffect(() => {
    rig.lens.aspect = size.width / Math.max(1, size.height)
    rig.lens.updateProjectionMatrix()
  }, [rig, size])

  // Priority 1 takes over rendering: the world first, then the hand on a cleared depth buffer.
  useFrame(({ clock }, elapsed) => {
    gl.autoClear = true
    gl.render(scene, camera)

    const game = useGame.getState()
    const visible = game.screen === 'game' && game.mode === 'explore' && !viewMode.third
    if (!visible) return
    const dt = Math.min(elapsed, 0.05)
    const s = rig.state
    // The hand dims with the world after dark.
    rig.fill.intensity = 0.8 + sky.daylight * 1.3
    rig.sun.intensity = 0.3 + sky.daylight * 1.3
    const stack = useInventory.getState().slots[game.hotbar]
    const key = stack?.item ?? ''

    // Switching items dips the hand out of view and brings the new one up.
    if (key !== s.item) {
      s.item = key
      s.equip = 0
      const def = key ? itemByKey.get(key) : undefined
      let kind: keyof typeof poses = 'hand'
      if (!def) {
        rig.model.geometry = rig.arm
        rig.model.material = rig.skin
      } else {
        let geometry = rig.models.get(key)
        if (!geometry) {
          geometry = def.block !== undefined ? cubeModel(def.block) : pixelModel(def.icon, def.tool ? 0.3 : 0.2)
          rig.models.set(key, geometry)
        }
        rig.model.geometry = geometry
        rig.model.material = def.block !== undefined ? rig.textured : rig.painted
        kind = def.block !== undefined ? 'block' : def.tool ? 'tool' : 'flat'
      }
      const pose = poses[kind]
      rig.model.position.set(0, 0, 0)
      rig.model.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2])
      rig.holder.userData.rest = pose.position
    }
    const calm = game.settings.reducedMotion
    s.equip = Math.min(1, s.equip + dt * 5)

    // A swing runs while the break button is held, and once for each block broken or placed.
    if (blockInput.swing !== s.lastSwing) { s.lastSwing = blockInput.swing; if (s.swing <= 0) s.swing = 1 }
    if (blockInput.breaking && !game.panel && s.swing <= 0) s.swing = 1
    s.swing = Math.max(0, s.swing - dt / 0.28)
    const arc = Math.sin((1 - s.swing) * Math.PI)

    const walking = !game.panel && [...keys].some((k) => movementKeys.has(k) && k !== 'shift' && k !== ' ' && k !== 'c')
    if (walking && !calm) s.walk += dt * 9
    const bobX = calm ? 0 : Math.sin(s.walk) * 0.018
    const bobY = calm ? 0 : -Math.abs(Math.cos(s.walk)) * 0.02 + Math.sin(clock.elapsedTime * 1.6) * 0.004

    const [rx, ry, rz] = (rig.holder.userData.rest as readonly number[] | undefined) ?? poses.hand.position
    rig.holder.position.set(rx + bobX - arc * 0.12, ry + bobY - (1 - s.equip) * 0.4 + arc * 0.06, rz - arc * 0.08)
    rig.holder.rotation.set(-arc * 0.9, arc * 0.35, arc * 0.25)

    gl.autoClear = false
    gl.clearDepth()
    gl.render(rig.view, rig.lens)
    gl.autoClear = true
  }, 1)

  return null
}
