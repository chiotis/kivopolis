import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from 'three'
import { blockSound } from '../game/audio'
import { copy } from '../game/el'
import { useGame } from '../game/store'
import { siteMarker, tourMarker } from '../game/theatre'
import { inventory, useInventory } from '../game/inventory'
import { itemByKey, mining, rollDrop } from '../game/items'
import { Block, blocks, isEmpty } from '../voxel/blocks'
import { PLAYER } from '../voxel/physics'
import { raycast, type VoxelHit } from '../voxel/raycast'
import { S, getWorld, index, inside, wx, wy, wz } from '../voxel/world'
import { spawnDrop } from './dropState'
import { pickAnimal } from './wildlife'
import { herd, strikeAnimal, tendAnimal } from './herd'
import { blockInput, playerState } from './player'

export const REACH = 4.6
const PLACE_REPEAT = 0.24
/** Seconds a freshly placed block takes to settle from a slight swell back to its size. */
const POP = 0.18

/**
 * The theatre is built by hand like everything else, so only the island's floor and the two
 * signposts (which start the campaign and the tour) are off limits.
 */
export function isProtected(x: number, y: number, z: number) {
  if (y <= 0) return true
  const px = wx(x) + S / 2, pz = wz(z) + S / 2
  return [siteMarker, tourMarker].some(([mx, , mz]) => Math.hypot(mx - px, mz - pz) < 0.6)
}

function overlapsPlayer(x: number, y: number, z: number) {
  const { position: p, crouching } = playerState.body
  const r = PLAYER.radius
  const h = crouching ? PLAYER.crouchHeight : PLAYER.height
  return wx(x) < p.x + r && wx(x + 1) > p.x - r && wz(z) < p.z + r && wz(z + 1) > p.z - r
    && wy(y) < p.y + h && wy(y + 1) > p.y
}

interface Particle { mesh: Mesh; vx: number; vy: number; vz: number; life: number }

function notify(message: string) {
  const state = useGame.getState()
  if (state.notice !== message) state.setNotice(message)
}

export function BlockInteraction() {
  const outline = useRef<LineSegments>(null)
  const crack = useRef<Mesh>(null)
  const sparks = useRef<Group>(null)
  const pop = useRef<Mesh>(null)
  /** Cell and start time (performance.now) of the last placed block. */
  const popped = useRef<{ x: number; y: number; z: number; at: number } | null>(null)
  const memory = useRef({ key: '', progress: 0, placeTimer: 0, hit: null as VoxelHit | null, chip: 0, cooldown: 0, struck: false })
  const particles = useRef<Particle[]>([])
  const assets = useMemo(() => {
    const box = new BoxGeometry(S * 1.004, S * 1.004, S * 1.004)
    return {
      edges: new EdgesGeometry(box),
      box,
      line: new LineBasicMaterial({ color: '#1d2a22', transparent: true, opacity: 0.85 }),
      locked: new LineBasicMaterial({ color: '#b54a32' }),
      shade: new MeshBasicMaterial({ color: '#1b1209', transparent: true, opacity: 0, depthWrite: false }),
      glow: new MeshBasicMaterial({ color: '#fff6df', transparent: true, opacity: 0, depthWrite: false }),
      chip: new BoxGeometry(S * 0.16, S * 0.16, S * 0.16),
      chipMaterials: new Map<number, MeshBasicMaterial>(),
    }
  }, [])

  function burst(x: number, y: number, z: number, id: number) {
    const group = sparks.current
    if (!group || useGame.getState().settings.reducedMotion) return
    let material = assets.chipMaterials.get(id)
    if (!material) {
      material = new MeshBasicMaterial({ color: blocks[id].color })
      assets.chipMaterials.set(id, material)
    }
    for (let i = 0; i < 10; i++) {
      const mesh = new Mesh(assets.chip, material)
      mesh.position.set(wx(x) + S * (0.2 + Math.random() * 0.6), wy(y) + S * (0.2 + Math.random() * 0.6), wz(z) + S * (0.2 + Math.random() * 0.6))
      group.add(mesh)
      particles.current.push({ mesh, vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.4, life: 0.55 + Math.random() * 0.25 })
    }
  }

  useFrame((_, elapsed) => {
    const dt = Math.min(elapsed, 0.05)
    const state = useGame.getState()
    const world = getWorld()
    const m = memory.current
    const active = state.screen === 'game' && state.mode === 'explore' && !state.panel

    // A placed block swells slightly with a pale flash, then settles to its size.
    if (pop.current) {
      const placed = popped.current
      const t = placed ? (performance.now() - placed.at) / 1000 / POP : 1
      pop.current.visible = Boolean(placed) && t < 1
      if (placed && t < 1) {
        const ease = 1 - (1 - t) ** 3
        pop.current.position.set(wx(placed.x) + S / 2, wy(placed.y) + S / 2, wz(placed.z) + S / 2)
        pop.current.scale.setScalar(1.16 - 0.16 * ease)
        assets.glow.opacity = 0.42 * (1 - ease)
      } else popped.current = null
    }

    for (const particle of [...particles.current]) {
      particle.life -= dt
      particle.vy -= 9 * dt
      particle.mesh.position.x += particle.vx * dt
      particle.mesh.position.y += particle.vy * dt
      particle.mesh.position.z += particle.vz * dt
      if (particle.life <= 0) {
        particle.mesh.removeFromParent()
        particles.current.splice(particles.current.indexOf(particle), 1)
      }
    }

    const pressing = blockInput.breaking || blockInput.breakOnce
    blockInput.breakOnce = false
    let hit = active ? raycast(world, playerState.eye, playerState.look, REACH) : null
    // An animal in front of the block under the crosshair takes the click instead.
    const target = active ? pickAnimal(herd.list, playerState.eye, playerState.look, REACH) : null
    if (target && (!hit || target.distance < hit.distance)) {
      hit = null
      if (pressing && !m.struck) {
        m.struck = true
        strikeAnimal(target.animal)
        blockInput.swing = performance.now()
      }
      if (blockInput.placeOnce) {
        blockInput.placeOnce = false
        blockInput.placing = false
        tendAnimal(target.animal)
        blockInput.swing = performance.now()
      }
    }
    if (!pressing) m.struck = false
    m.hit = hit
    if (outline.current && crack.current) {
      outline.current.visible = Boolean(hit) && !state.photo
      crack.current.visible = false
      if (hit) {
        const cx = wx(hit.x) + S / 2, cy = wy(hit.y) + S / 2, cz = wz(hit.z) + S / 2
        outline.current.position.set(cx, cy, cz)
        crack.current.position.set(cx, cy, cz)
        outline.current.material = isProtected(hit.x, hit.y, hit.z) ? assets.locked : assets.line
      }
    }

    m.cooldown -= dt
    // Breaking: hold the primary button on the same block for its hardness in seconds.
    const key = hit ? `${hit.x},${hit.y},${hit.z}` : ''
    if (!active || !pressing || !hit) {
      // A quick click only starts the crack; say so, since breaking needs the button held.
      if (active && !pressing && m.progress > 0 && m.progress < 0.5) notify(copy.holdToBreak)
      m.progress = 0
      m.key = key
    } else {
      if (key !== m.key) { m.key = key; m.progress = 0 }
      const id = world.get(hit.x, hit.y, hit.z)
      if (isProtected(hit.x, hit.y, hit.z)) {
        notify(copy.protectedSite)
      } else {
        const def = blocks[id]
        const held = useInventory.getState().slots[state.hotbar]
        const { time, harvest } = mining(def, held)
        // Creative play breaks at once, with a short pause between blocks while the button is held.
        const creative = state.progress.creative
        if (creative) m.progress = m.cooldown <= 0 ? 1 : 0
        else m.progress += dt / Math.max(0.05, time)
        m.chip -= dt
        if (m.chip <= 0 && state.settings.sound) { blockSound(def.sound, 'hit'); m.chip = 0.22 }
        if (crack.current) {
          crack.current.visible = true
          assets.shade.opacity = Math.min(0.55, m.progress * 0.55)
        }
        if (m.progress >= 1) {
          world.set(hit.x, hit.y, hit.z, Block.air)
          blockInput.swing = performance.now()
          if (state.settings.sound) blockSound(def.sound, 'break')
          burst(hit.x, hit.y, hit.z, id)
          const cx = wx(hit.x) + S / 2, cy = wy(hit.y) + S / 2, cz = wz(hit.z) + S / 2
          const drop = harvest && !creative ? rollDrop(def) : null
          if (drop) spawnDrop(drop, cx, cy, cz)
          if (id === Block.kiln) for (const stack of inventory.removeKiln(String(index(hit.x, hit.y, hit.z)))) spawnDrop(stack, cx, cy, cz)
          if (!creative && held && itemByKey.get(held.item)?.tool && inventory.wear(state.hotbar) && state.settings.sound) blockSound('wood', 'break')
          if (creative) m.cooldown = 0.22
          m.progress = 0
          m.key = ''
        }
      }
    }

    blockInput.progress = m.progress

    // Placing: one block per click, repeating while the secondary button is held.
    m.placeTimer -= dt
    const wantsPlace = blockInput.placeOnce || (blockInput.placing && m.placeTimer <= 0)
    blockInput.placeClick = blockInput.placeOnce
    blockInput.placeOnce = false
    if (active && wantsPlace && hit) {
      m.placeTimer = PLACE_REPEAT
      const [nx, ny, nz] = hit.normal
      const x = hit.x + nx, y = hit.y + ny, z = hit.z + nz
      // Workshops and kilns open on use unless the player is crouching to build against them.
      const target = world.get(hit.x, hit.y, hit.z)
      if (blockInput.placeClick && !playerState.body.crouching && (target === Block.workshop || target === Block.kiln)) {
        blockInput.placeClick = false
        blockInput.placing = false
        if (target === Block.workshop) state.openContainer('workshop')
        else state.openContainer('kiln', String(index(hit.x, hit.y, hit.z)))
        return
      }
      blockInput.placeClick = false
      const held = useInventory.getState().slots[state.hotbar]
      const id = held ? itemByKey.get(held.item)?.block : undefined
      if (id === undefined) return
      // Blocks go into air or water; the sea is not a wall.
      if (!(nx || ny || nz) || !inside(x, y, z) || !isEmpty(world.get(x, y, z))) return
      if (isProtected(x, y, z)) { notify(copy.protectedSite); return }
      if (overlapsPlayer(x, y, z)) return
      if (world.set(x, y, z, id)) {
        blockInput.swing = performance.now()
        if (!state.progress.creative) inventory.take(state.hotbar)
        if (id === Block.lamp) state.learn('lamp')
        if (state.settings.sound) blockSound(blocks[id].sound, 'place')
        if (!state.settings.reducedMotion) popped.current = { x, y, z, at: performance.now() }
      }
    }
  })

  return (
    <>
      <lineSegments ref={outline} geometry={assets.edges} material={assets.line} visible={false} renderOrder={3} />
      <mesh ref={crack} geometry={assets.box} material={assets.shade} visible={false} renderOrder={2} />
      <group ref={sparks} />
      <mesh ref={pop} geometry={assets.box} material={assets.glow} visible={false} renderOrder={4} />
    </>
  )
}
