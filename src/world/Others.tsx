import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import { useGame } from '../game/store'
import { others, TUNICS, useRoom } from '../net/roomState'
import type { PlayerInfo } from '../net/protocol'

/** The other players in the room (Phase 12): the same simple figure as the third-person view, in their tunic colour, with their name above. */
export function Others() {
  const players = useRoom((state) => state.players)
  return <>{players.map((player) => <OtherPlayer key={player.id} player={player} />)}</>
}

function OtherPlayer({ player }: { player: PlayerInfo }) {
  const model = useRef<Group>(null)
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const last = useRef({ x: 0, z: 0, moving: 0 })
  const tunic = TUNICS[player.color % TUNICS.length]

  useFrame(({ clock }, elapsed) => {
    const group = model.current
    const pose = others.get(player.id)
    if (!group) return
    const state = useGame.getState()
    group.visible = Boolean(pose) && state.screen === 'game'
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
      <Html position={[0, 1.95, 0]} center distanceFactor={9} zIndexRange={[20, 0]} className="player-tag">
        <span style={{ borderColor: tunic }}>{player.name}</span>
      </Html>
    </group>
  )
}
