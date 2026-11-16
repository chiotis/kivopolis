import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, EdgesGeometry, LineBasicMaterial, LineSegments, MeshBasicMaterial, SRGBColorSpace, Sprite, SpriteMaterial, type Group, type Mesh } from 'three'
import { useGame } from '../game/store'
import { bubbles, markers, others, TUNICS, useRoom } from '../net/roomState'
import { PHRASES, type PlayerInfo } from '../net/protocol'
import { S, wx, wy, wz } from '../voxel/grid'

/** The other players in the room (Phase 12): the same simple figure as the third-person view, in their tunic colour, with their name above. */
export function Others() {
  const players = useRoom((state) => state.players)
  const me = useRoom((state) => state.me)
  return <>
    {players.map((player) => <OtherPlayer key={player.id} player={player} />)}
    {[...(me ? [me] : []), ...players].map((player) => <Marker key={player.id} player={player} />)}
  </>
}

/**
 * A text label drawn on a canvas and shown as a sprite that always faces the camera: a player's
 * name (dark, framed in their colour) or what they just said (a light speech bubble).
 */
function label(sprite: Sprite, text: string, color: string, bubble: boolean) {
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')!
  const font = `700 ${bubble ? 30 : 34}px Manrope, system-ui, sans-serif`
  g.font = font
  const width = Math.ceil(g.measureText(text).width) + 36, height = 54
  canvas.width = width
  canvas.height = height
  g.font = font
  g.fillStyle = bubble ? '#f3e6c4' : '#1d1a14dd'
  g.strokeStyle = color
  g.lineWidth = 5
  g.beginPath()
  g.roundRect(3, 3, width - 6, height - 6, 12)
  g.fill()
  g.stroke()
  g.fillStyle = bubble ? '#2b2418' : '#f6f0de'
  g.textBaseline = 'middle'
  g.fillText(text, 18, height / 2 + 1)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const material = sprite.material as SpriteMaterial
  material.map?.dispose()
  material.map = texture
  material.needsUpdate = true
  // About a quarter of a block tall, keeping the text's proportions.
  sprite.scale.set(0.3 * width / height, 0.3, 1)
}

/** How long a pointed block stays marked, in milliseconds. */
const MARK_FOR = 8000

/** The block a player pointed at: an outline and a beam of light in their colour, pulsing for a few seconds. */
function Marker({ player }: { player: PlayerInfo }) {
  const box = useRef<LineSegments>(null)
  const beam = useRef<Mesh>(null)
  const assets = useMemo(() => {
    const color = TUNICS[player.color % TUNICS.length]
    return {
      edges: new EdgesGeometry(new BoxGeometry(S * 1.08, S * 1.08, S * 1.08)),
      line: new LineBasicMaterial({ color, transparent: true, depthTest: false }),
      beam: new BoxGeometry(S * 0.18, 6, S * 0.18),
      glow: new MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
    }
  }, [player.color])
  useFrame(({ clock }) => {
    const mark = markers.get(player.id)
    const age = mark ? performance.now() - mark.at : Infinity
    const shown = age < MARK_FOR
    if (box.current) box.current.visible = shown
    if (beam.current) beam.current.visible = shown
    if (!mark || !shown) return
    const [x, y, z] = mark.cell
    const cx = wx(x) + S / 2, cy = wy(y) + S / 2, cz = wz(z) + S / 2
    box.current?.position.set(cx, cy, cz)
    beam.current?.position.set(cx, cy + 3 + S / 2, cz)
    const pulse = 0.55 + Math.sin(clock.elapsedTime * 6) * 0.45
    assets.line.opacity = pulse * (1 - age / MARK_FOR) + 0.2
    assets.glow.opacity = 0.35 * (1 - age / MARK_FOR)
  })
  return <>
    <lineSegments ref={box} geometry={assets.edges} material={assets.line} renderOrder={5} visible={false} />
    <mesh ref={beam} geometry={assets.beam} material={assets.glow} visible={false} />
  </>
}

function OtherPlayer({ player }: { player: PlayerInfo }) {
  const model = useRef<Group>(null)
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const last = useRef({ x: 0, z: 0, moving: 0 })
  const tunic = TUNICS[player.color % TUNICS.length]
  // The name above their head, and a bubble above it for a few seconds after they say something.
  const tags = useMemo(() => {
    const make = () => new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }))
    const name = make(), bubble = make()
    name.position.set(0, 1.95, 0)
    bubble.position.set(0, 2.32, 0)
    name.renderOrder = bubble.renderOrder = 6
    label(name, player.name, tunic, false)
    bubble.visible = false
    return { name, bubble, phrase: -1 }
  }, [player.name, tunic])
  useEffect(() => () => {
    for (const sprite of [tags.name, tags.bubble]) { (sprite.material as SpriteMaterial).map?.dispose(); sprite.material.dispose() }
  }, [tags])

  useFrame(({ clock }, elapsed) => {
    const group = model.current
    const pose = others.get(player.id)
    if (!group) return
    const state = useGame.getState()
    group.visible = Boolean(pose) && state.screen === 'game'
    const said = bubbles.get(player.id)
    const showing = said && performance.now() - said.at < 6000 ? said.phrase : -1
    if (showing !== tags.phrase) {
      tags.phrase = showing
      tags.bubble.visible = showing >= 0
      if (showing >= 0) label(tags.bubble, PHRASES[showing], tunic, true)
    }
    if (!pose) return
    // Positions arrive ten times a second; glide towards the latest one in between.
    const [x, y, z] = pose.p
    const first = group.position.lengthSq() === 0
    const follow = first ? 1 : 1 - Math.exp(-Math.min(elapsed, 0.1) * 12)
    group.position.x += (x - group.position.x) * follow
    group.position.y += (y - group.position.y) * follow
    group.position.z += (z - group.position.z) * follow
    group.rotation.y = pose.yaw
    const step = Math.hypot(x - last.current.x, z - last.current.z)
    last.current = { x, z, moving: step > 0.002 ? 0.3 : Math.max(0, last.current.moving - elapsed) }
    const stride = last.current.moving > 0 && !state.settings.reducedMotion ? Math.sin(clock.elapsedTime * 11) * 0.52 : 0
    if (left.current) left.current.rotation.x = stride
    if (right.current) right.current.rotation.x = -stride
  })

  return (
    <group ref={model} visible={false}>
      <mesh position={[0, 0.018, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.36, 16]} />
        <meshBasicMaterial color="#393f29" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 0.63, 7]} />
        <meshStandardMaterial color={tunic} />
      </mesh>
      <mesh position={[0, 0.79, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.28, 0.10, 7]} />
        <meshStandardMaterial color="#5a3e2c" />
      </mesh>
      <mesh position={[0, 1.34, 0.005]} castShadow>
        <boxGeometry args={[0.30, 0.31, 0.28]} />
        <meshStandardMaterial color="#c89064" />
      </mesh>
      <mesh position={[0, 1.50, -0.025]} castShadow>
        <boxGeometry args={[0.32, 0.105, 0.30]} />
        <meshStandardMaterial color="#553f2d" />
      </mesh>
      {[left, right].map((leg, index) => (
        <group key={index} ref={leg} position={[index ? 0.135 : -0.135, 0.60, 0]}>
          <mesh position={[0, -0.27, 0.02]} castShadow>
            <boxGeometry args={[0.12, 0.56, 0.13]} />
            <meshStandardMaterial color="#c89064" />
          </mesh>
        </group>
      ))}
      <primitive object={tags.name} />
      <primitive object={tags.bubble} />
    </group>
  )
}
