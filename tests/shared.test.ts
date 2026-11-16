import { describe, expect, it } from 'vitest'
import { readRecord, writeRecord } from '../src/game/save'

describe('the shared game, this player and this device', () => {
  it('loads a version 2 save into the shared game and the player, and saves version 3', async () => {
    // The store reads the save when it is first imported, so write the record before that.
    writeRecord('game', {
      version: 2,
      progress: { started: true, discovered: true, player: [3, 0, 7], celebrated: ['orchestra', 'nonsense'], facts: ['sheep'], time: 0.6, creative: true },
      settings: { quality: 'high', sound: false, reducedMotion: false, dayCycle: true, fov: 80, sensitivity: 1, invertY: false },
    })
    const { useGame, useShared } = await import('../src/game/store')
    expect(useShared.getState()).toMatchObject({ started: true, discovered: true, celebrated: ['orchestra'], facts: ['sheep'], time: 0.6, creative: true, buildings: {} })
    expect(useGame.getState().player).toEqual([3, 0, 7])
    expect(useGame.getState().settings.fov).toBe(80)
    // Any change writes the three parts apart.
    useShared.setState({ time: 0.7 })
    const saved = readRecord<{ version: number; shared: { time: number }; player: { position: number[] }; settings: { fov: number } }>('game')!
    expect(saved.version).toBe(3)
    expect(saved.shared.time).toBe(0.7)
    expect(saved.player.position).toEqual([3, 0, 7])
    expect(saved.settings.fov).toBe(80)
    expect('progress' in saved).toBe(false)
  })

  it('applies player actions in one place: blocks, breaking with a drop, restarting a step', async () => {
    const { apply } = await import('../src/game/actions')
    const { getWorld, OX, OZ } = await import('../src/voxel/world')
    const { Block } = await import('../src/voxel/blocks')
    const { drops, clearDrops } = await import('../src/world/dropState')
    const { missionCells } = await import('../src/game/blueprints/theatre')
    const { useInventory } = await import('../src/game/inventory')
    const world = getWorld()
    clearDrops()
    expect(apply({ type: 'set', x: OX, y: 40, z: OZ, block: Block.marble })).toBe(true)
    expect(apply({ type: 'set', x: OX, y: 40, z: OZ, block: Block.marble })).toBe(false)
    expect(apply({ type: 'break', x: OX, y: 40, z: OZ, drop: { item: 'marble', count: 1 } })).toBe(true)
    expect(world.get(OX, 40, OZ)).toBe(Block.air)
    expect(drops.map((drop) => drop.stack)).toEqual([{ item: 'marble', count: 1 }])
    // Restarting a step takes its blocks down and hands them back.
    const [cell] = missionCells('orchestra')
    apply({ type: 'set', x: cell.x, y: cell.y, z: cell.z, block: cell.block })
    const before = useInventory.getState().slots.filter(Boolean).length
    expect(apply({ type: 'restart', mission: 'orchestra', at: [0, 0, 0] })).toBe(true)
    expect(world.get(cell.x, cell.y, cell.z)).toBe(Block.air)
    expect(useInventory.getState().slots.filter(Boolean).length).toBeGreaterThan(before)
  })
})
