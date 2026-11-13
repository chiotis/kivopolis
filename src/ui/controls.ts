import { useEffect } from 'react'
import { inventory } from '../game/inventory'
import { interactionAvailable, useGame } from '../game/store'
import { spawnDrop } from '../world/dropState'
import { jumpTapped, playerState } from '../world/player'
import { keys, movementKeys, viewMode } from '../world/camera'

export function useControls() {
  useEffect(() => {
    function down(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      const state = useGame.getState()
      if (key === 'escape') {
        if (state.panel) state.setPanel(null)
        else if (state.screen === 'game' && state.mode === 'tour') state.endTour()
        else if (state.screen === 'game') state.setPanel('pause')
        return
      }
      const containerOpen = state.panel === 'inventory' || state.panel === 'workshop' || state.panel === 'kiln'
      if (key === 'e' && containerOpen && !event.repeat) {
        state.setPanel(null)
        return
      }
      if (state.screen !== 'game' || state.panel || event.ctrlKey || event.metaKey || event.altKey) return
      if (movementKeys.has(key)) {
        if (state.mode !== 'explore') return
        event.preventDefault()
        keys.add(key)
      }
      if (event.repeat) return
      if (key === ' ' && state.mode === 'explore') jumpTapped(state.progress.creative)
      if (key === 'b') state.toggleOverview()
      if (key === 'e') {
        if (interactionAvailable(state)) state.interact()
        else state.openContainer('inventory')
      }
      if (key === 'q' && state.mode === 'explore') {
        const thrown = inventory.take(state.hotbar, event.shiftKey ? 64 : 1)
        if (thrown) {
          const [x, y, z] = playerState.eye
          const [lx, ly, lz] = playerState.look
          spawnDrop(thrown, x + lx * 0.5, y - 0.2, z + lz * 0.5, [lx * 4, ly * 4 + 1.5, lz * 4], 1.5)
        }
      }
      if (state.mode === 'explore' && /^[1-9]$/.test(key)) state.setHotbar(Number(key) - 1)
      if (key === 'v' && state.mode === 'explore') viewMode.third = !viewMode.third
    }
    const up = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase())
    const blur = () => keys.clear()
    const stopOnPanel = useGame.subscribe((state, previous) => {
      if (state.panel || state.mode !== previous.mode || state.screen !== previous.screen) keys.clear()
    })
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      stopOnPanel()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keys.clear()
    }
  }, [])
}
