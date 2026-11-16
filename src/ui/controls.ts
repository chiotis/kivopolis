import { useEffect } from 'react'
import { inventory } from '../game/inventory'
import { interactionAvailable, useGame, useShared } from '../game/store'
import { apply } from '../game/actions'
import { blockInput, jumpTapped, playerState } from '../world/player'
import { keys, movementKeys, viewMode } from '../world/camera'
import { inRoom } from '../game/save'
import { roomActions, useRoom } from '../net/roomState'
import { PHRASES } from '../net/protocol'
import { savePicture } from '../world/picture'

/** Name a key by its physical position for letters and digits, so W/A/S/D and
 * the other shortcuts work on any keyboard layout (Greek, Cyrillic, …). */
function keyName(event: KeyboardEvent) {
  const code = event.code
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  return event.key.toLowerCase()
}

export function useControls() {
  useEffect(() => {
    function down(event: KeyboardEvent) {
      const key = keyName(event)
      const state = useGame.getState()
      // F1 hides the interface for pictures and F2 saves one; both replace the browser's own F1/F2.
      if ((key === 'f1' || key === 'f2') && state.screen === 'game' && !state.panel) {
        event.preventDefault()
        if (event.repeat) return
        if (key === 'f1') state.setPhoto(!state.photo)
        else void savePicture()
        return
      }
      if (key === 'escape') {
        if (state.photo) state.setPhoto(false)
        else if (state.panel) state.setPanel(null)
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
        // Walking moves the player; in the overview the same keys slide the camera across the island.
        if (state.mode === 'tour') return
        event.preventDefault()
        keys.add(key)
      }
      if (event.repeat) return
      if (key === ' ' && state.mode === 'explore') jumpTapped(useShared.getState().creative)
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
          apply({ type: 'throw', stack: thrown, from: [x + lx * 0.5, y - 0.2, z + lz * 0.5], velocity: [lx * 4, ly * 4 + 1.5, lz * 4], delay: 1.5 })
        }
      }
      // In a room: T opens the phrase menu (then 1–9 say a phrase), G points everyone to the block in sight.
      if (inRoom() && state.mode === 'explore' && key === 't') { useRoom.setState((room) => ({ phrasing: !room.phrasing })); return }
      if (inRoom() && state.mode === 'explore' && key === 'g' && blockInput.aim) { roomActions.point(blockInput.aim); return }
      if (inRoom() && useRoom.getState().phrasing && /^[1-9]$/.test(key)) {
        if (Number(key) <= PHRASES.length) roomActions.say(Number(key) - 1)
        useRoom.setState({ phrasing: false })
        return
      }
      if (state.mode === 'explore' && /^[1-9]$/.test(key)) state.setHotbar(Number(key) - 1)
      if (key === 'v' && state.mode === 'explore') viewMode.third = !viewMode.third
    }
    const up = (event: KeyboardEvent) => keys.delete(keyName(event))
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
