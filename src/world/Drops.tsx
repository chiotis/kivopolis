import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, DoubleSide, Group, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three'
import { blockSound } from '../game/audio'
import { inventory } from '../game/inventory'
import { itemByKey } from '../game/items'
import { useGame, type Panel } from '../game/store'
import { blocks } from '../voxel/blocks'
import { sharedAtlas } from '../voxel/atlas'
import { tileUV } from '../voxel/mesher'
import { getWorld, bx, by, bz, wy } from '../voxel/world'
import { clearDrops, drops, LIFETIME, spawnDrop } from './dropState'
import { playerState } from './player'

const containers = new Set<Panel>(['inventory', 'workshop', 'kiln'])
const SIZE = 0.2
const PICKUP = 1.25

/** Box UVs follow three's face order: +x, -x, +y, -y, +z, -z. */
function cubeGeometry(blockId: number) {
  const geometry = new BoxGeometry(SIZE, SIZE, SIZE)
  const { tiles } = blocks[blockId]
  const faceTiles = [tiles.side, tiles.side, tiles.top, tiles.bottom, tiles.side, tiles.side]
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = tileUV(faceTiles[Math.floor(i / 4)], uv.getX(i), uv.getY(i))
    uv.setXY(i, u, v)
  }
  return geometry
}

function spriteGeometry(tile: number) {
  const geometry = new PlaneGeometry(SIZE * 1.6, SIZE * 1.6)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = tileUV(tile, uv.getX(i), uv.getY(i))
    uv.setXY(i, u, v)
  }
  return geometry
}

/** Spawns stacks just in front of the player, e.g. when closing a full inventory. */
export function dropNearPlayer(stacks: { item: string; count: number; damage?: number }[], delay = 1.5) {
  const [x, y, z] = playerState.eye
  const [lx, , lz] = playerState.look
  for (const stack of stacks) spawnDrop(stack, x + lx * 0.6, y - 0.3, z + lz * 0.6, [lx * 2.5, 1.5, lz * 2.5], delay)
}

export function Drops() {
  const group = useRef<Group>(null)
  const meshes = useRef(new Map<number, Mesh>())
  const kilnClock = useRef(0)
  const assets = useMemo(() => ({
    material: new MeshLambertMaterial({ map: sharedAtlas(), alphaTest: 0.5, side: DoubleSide }),
    geometries: new Map<string, BufferGeometry>(),
  }), [])

  useEffect(() => useGame.subscribe((state, previous) => {
    if (state.panel === previous.panel) return
    if (previous.panel && containers.has(previous.panel) && !(state.panel && containers.has(state.panel))) {
      dropNearPlayer(inventory.close())
    }
    if (state.screen !== previous.screen && state.screen === 'menu') clearDrops()
  }), [])

  useEffect(() => () => {
    for (const geometry of assets.geometries.values()) geometry.dispose()
    assets.material.dispose()
  }, [assets])

  function geometryFor(item: string) {
    let geometry = assets.geometries.get(item)
    if (!geometry) {
      const def = itemByKey.get(item)!
      geometry = def.block !== undefined ? cubeGeometry(def.block) : spriteGeometry(def.icon)
      assets.geometries.set(item, geometry)
    }
    return geometry
  }

  useFrame(({ camera, clock }, elapsed) => {
    const dt = Math.min(elapsed, 0.05)
    const root = group.current
    if (!root) return
    const state = useGame.getState()

    kilnClock.current += dt
    if (kilnClock.current >= 0.2) {
      inventory.tick(kilnClock.current)
      kilnClock.current = 0
    }

    const world = getWorld()
    const body = playerState.body.position
    const live = new Set<number>()
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i]
      if (!state.panel) {
        drop.age += dt
        drop.vy = Math.max(-20, drop.vy - 18 * dt)
        const nx = drop.x + drop.vx * dt, nz = drop.z + drop.vz * dt
        if (!world.solidAt(bx(nx), by(drop.y + 0.02), bz(drop.z))) drop.x = nx; else drop.vx *= -0.3
        if (!world.solidAt(bx(drop.x), by(drop.y + 0.02), bz(nz))) drop.z = nz; else drop.vz *= -0.3
        const ny = drop.y + drop.vy * dt
        if (world.solidAt(bx(drop.x), by(ny), bz(drop.z))) {
          drop.y = wy(by(ny) + 1)
          drop.vy = 0
          drop.vx *= 0.8
          drop.vz *= 0.8
        } else {
          drop.y = ny
        }
        // Items embedded in a newly placed block pop up on top of it.
        if (world.solidAt(bx(drop.x), by(drop.y + 0.01), bz(drop.z))) drop.y = wy(by(drop.y + 0.01) + 1)
      }

      const exploring = state.screen === 'game' && state.mode === 'explore' && !state.panel
      const distance = Math.hypot(body.x - drop.x, body.y + 0.7 - drop.y, body.z - drop.z)
      if (exploring && drop.age > drop.delay && distance < PICKUP) {
        const left = inventory.add(drop.stack)
        if (left < drop.stack.count && state.settings.sound) blockSound('soft', 'place')
        drop.stack.count = left
      }
      if (drop.stack.count <= 0 || drop.age > LIFETIME || drop.y < -8) {
        drops.splice(i, 1)
        continue
      }

      live.add(drop.id)
      let mesh = meshes.current.get(drop.id)
      if (!mesh) {
        mesh = new Mesh(geometryFor(drop.stack.item), assets.material)
        mesh.castShadow = true
        meshes.current.set(drop.id, mesh)
        root.add(mesh)
      }
      const bob = state.settings.reducedMotion ? 0 : Math.sin(clock.elapsedTime * 2.6 + drop.id) * 0.04
      mesh.position.set(drop.x, drop.y + SIZE * 0.6 + 0.04 + bob, drop.z)
      if (itemByKey.get(drop.stack.item)?.block !== undefined) mesh.rotation.y = clock.elapsedTime * 1.2 + drop.id
      else mesh.quaternion.copy(camera.quaternion)
    }
    for (const [id, mesh] of meshes.current) {
      if (live.has(id)) continue
      mesh.removeFromParent()
      meshes.current.delete(id)
    }
  })

  return <group ref={group} />
}
