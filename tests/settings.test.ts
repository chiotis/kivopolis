import { describe, expect, it } from 'vitest'
import { writeRecord } from '../src/game/save'

describe('view settings', () => {
  it('loads field of view, look speed and invert-Y, clamping values out of range', async () => {
    // The store reads the save when it is first imported, so write the record before that.
    writeRecord('game', {
      version: 2,
      progress: { started: true },
      settings: { quality: 'low', sound: true, reducedMotion: false, dayCycle: true, fov: 300, sensitivity: 'fast', invertY: true },
    })
    const { useGame, fovRange } = await import('../src/game/store')
    const { settings } = useGame.getState()
    expect(settings.fov).toBe(fovRange[1])
    expect(settings.sensitivity).toBe(1)
    expect(settings.invertY).toBe(true)
    expect(settings.quality).toBe('low')
  })

  it('enters screenshot mode only in play, and leaves it when a dialog opens', async () => {
    const { useGame } = await import('../src/game/store')
    const state = useGame.getState()
    state.setPhoto(true)
    expect(useGame.getState().photo).toBe(false) // still on the menu
    state.start()
    useGame.getState().setPhoto(true)
    expect(useGame.getState().photo).toBe(true)
    useGame.getState().setPanel('pause')
    expect(useGame.getState().photo).toBe(false)
    useGame.getState().setPanel(null)
    useGame.getState().setPhoto(true)
    useGame.getState().toggleOverview() // the overview needs a discovered site; the view stays, so photo stays
    expect(useGame.getState().photo).toBe(true)
    useGame.getState().goHome()
    expect(useGame.getState().photo).toBe(false)
  })
})
