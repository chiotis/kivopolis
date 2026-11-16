import { useEffect, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { MathUtils } from 'three'
import { useGame } from '../game/store'
import type { View } from './camera'

import { OVERVIEW_PAN, OVERVIEW_ZOOM } from './view'
import { blockInput } from './player'

const LOOK_SPEED = 0.0024

/** Look speed and vertical direction from the settings: [yaw factor, pitch factor]. */
function lookFactors() {
  const { sensitivity, invertY } = useGame.getState().settings
  return [sensitivity, invertY ? -sensitivity : sensitivity] as const
}

export function SceneInput({ view }: { view: RefObject<View> }) {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let primary: { id: number; x: number; y: number; moved: boolean; pan: boolean } | null = null
    let pinch = 0
    const locked = () => document.pointerLockElement === canvas
    const exploring = () => {
      const state = useGame.getState()
      return state.screen === 'game' && state.mode === 'explore' && !state.panel
    }
    function lock() {
      if (locked() || !canvas.requestPointerLock) return
      try {
        const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined
        void request?.catch?.(() => undefined)
      } catch {
        // Pointer lock is optional: dragging still turns the view.
      }
    }
    function releaseBlocks() {
      blockInput.breaking = false
      blockInput.placing = false
    }
    const stopLock = useGame.subscribe((state) => {
      const keep = state.screen === 'game' && state.mode === 'explore' && !state.panel
      if (!keep) {
        releaseBlocks()
        if (locked()) document.exitPointerLock()
      }
    })
    function lockChange() { if (!locked()) releaseBlocks() }

    function down(event: PointerEvent) {
      const state = useGame.getState()
      if (exploring() && event.pointerType === 'mouse') {
        if (event.button === 2) {
          blockInput.placeOnce = true
          blockInput.placing = true
          return
        }
        if (event.button === 0) {
          if (!locked()) lock()
          blockInput.breaking = true
          blockInput.breakOnce = true
          if (locked()) return
        }
      }
      if (state.screen !== 'game' || state.panel || state.mode === 'tour' || event.button === 2) return
      if (event.button !== 0 && event.button !== 1) return
      try { canvas.setPointerCapture(event.pointerId) } catch { /* not capturable */ }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (!primary) primary = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, pan: event.shiftKey || event.button === 1 }
      if (pointers.size === 2) {
        primary.moved = true
        const [a, b] = [...pointers.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }

    function move(event: PointerEvent) {
      const state = useGame.getState()
      if (state.screen !== 'game' || state.panel || state.mode === 'tour') return
      if (locked()) {
        if (state.mode !== 'explore') return
        const [yaw, pitch] = lookFactors()
        view.current.walkYaw -= event.movementX * LOOK_SPEED * yaw
        view.current.walkPitch = MathUtils.clamp(view.current.walkPitch - event.movementY * LOOK_SPEED * pitch, -1.5, 1.5)
        return
      }
      const point = pointers.get(event.pointerId)
      if (point) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2 && state.mode === 'overview') {
        const [a, b] = [...pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        view.current.zoom = MathUtils.clamp(view.current.zoom * (pinch / Math.max(distance, 1)), 10.5, OVERVIEW_ZOOM)
        pinch = distance
        return
      }
      if (primary?.id === event.pointerId) {
        const dx = event.clientX - primary.x, dy = event.clientY - primary.y
        if (!primary.moved && Math.hypot(dx, dy) < 5) return
        primary.moved = true
        primary.x = event.clientX
        primary.y = event.clientY
        const orbit = view.current
        if (state.mode === 'overview') {
          if (primary.pan) {
            const speed = orbit.zoom * 0.0024
            orbit.x = MathUtils.clamp(orbit.x + (-dx * Math.cos(orbit.yaw) - dy * Math.sin(orbit.yaw)) * speed, -OVERVIEW_PAN, OVERVIEW_PAN)
            orbit.z = MathUtils.clamp(orbit.z + (dx * Math.sin(orbit.yaw) - dy * Math.cos(orbit.yaw)) * speed, -OVERVIEW_PAN, OVERVIEW_PAN)
          } else {
            orbit.yaw -= dx * 0.007
            orbit.pitch = MathUtils.clamp(orbit.pitch + dy * 0.006, 0.43, 1.48)
          }
        } else {
          // Dragging turns the view (touch, or a mouse without pointer lock); it never also breaks.
          blockInput.breaking = false
          const [yaw, pitch] = lookFactors()
          orbit.walkYaw -= dx * 0.006 * yaw
          orbit.walkPitch = MathUtils.clamp(orbit.walkPitch - dy * 0.005 * pitch, -1.5, 1.5)
        }
      }
    }

    function release(event: PointerEvent) {
      if (event.pointerType === 'mouse') {
        if (event.button === 0 || event.type === 'pointercancel') blockInput.breaking = false
        if (event.button === 2 || event.type === 'pointercancel') blockInput.placing = false
      }
      pointers.delete(event.pointerId)
      if (primary?.id !== event.pointerId) return
      primary = null
    }

    function wheel(event: WheelEvent) {
      const state = useGame.getState()
      if (exploring()) {
        event.preventDefault()
        if (Math.abs(event.deltaY) > 1) state.setHotbar(state.hotbar + Math.sign(event.deltaY))
        return
      }
      if (state.mode !== 'overview' || state.screen !== 'game' || state.panel) return
      event.preventDefault()
      view.current.zoom = MathUtils.clamp(view.current.zoom * Math.exp(event.deltaY * 0.001), 10.5, OVERVIEW_ZOOM)
    }

    function context(event: MouseEvent) {
      const state = useGame.getState()
      if (state.screen === 'game' && state.mode === 'explore') event.preventDefault()
      if (state.mode === 'overview' && state.screen === 'game') event.preventDefault()
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('contextmenu', context)
    document.addEventListener('pointerlockchange', lockChange)
    return () => {
      stopLock()
      document.removeEventListener('pointerlockchange', lockChange)
      if (locked()) document.exitPointerLock()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', release)
      canvas.removeEventListener('pointercancel', release)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', context)
    }
  }, [gl, view])
  return null
}
