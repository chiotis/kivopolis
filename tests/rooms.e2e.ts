import { expect, test, type Browser, type Page } from '@playwright/test'
import { copy } from '../src/game/el'

/**
 * Two players in one room, each in their own browser (Phase 12): they see each other, the same
 * animals and the same dropped items, and what one picks up is gone for the other.
 */

type Polis = {
  player: { body: { position: { x: number; y: number; z: number } } }
  herd: { remote: boolean; list: { id: number; x: number; z: number }[] }
  drops: { id: number; stack: { item: string; count: number }; x: number; y: number; z: number }[]
  apply: (action: unknown) => boolean
  inventory: { getState(): { slots: ({ item: string; count: number } | null)[] } }
}
declare global { interface Window { __polis: Polis } }

async function enter(browser: Browser, name: string, code?: string) {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await page.getByRole('button', { name: copy.rooms }).click()
  if (code) {
    await page.getByRole('radio', { name: copy.joinRoom }).click()
    await page.getByLabel(copy.roomCode).fill(code)
  }
  await page.getByLabel(copy.nickname).fill(name)
  await page.getByRole('button', { name: code ? copy.roomJoinGo : copy.roomCreateGo }).click()
  // Joining reloads the game into the room.
  await expect(page.locator('.room-banner strong')).toHaveText(/^[A-Z2-9]{6}$/, { timeout: 30_000 })
  await page.getByRole('button', { name: copy.continue }).click()
  await page.waitForFunction(() => window.__polis?.herd.remote)
  return page
}

const players = (page: Page) => page.locator('.hud-room li')

test('two players share one island', async ({ browser }, info) => {
  test.skip(info.project.name !== 'chromium', 'one browser kind is enough for the room')
  const a = await enter(browser, 'Ελένη')
  const code = (await a.locator('.hud-room .room-head strong').textContent())!.trim()
  const b = await enter(browser, 'Νίκος', code)

  // Each sees the other in the room's list.
  await expect(players(a)).toHaveCount(2)
  await expect(players(b)).toHaveCount(2)
  await expect(players(a).filter({ hasText: 'Νίκος' })).toBeVisible()

  // The same animals, in about the same places: the room runs them.
  const herdOf = (page: Page) => page.evaluate(() => window.__polis.herd.list.map((animal) => [animal.id, animal.x, animal.z]))
  await a.waitForTimeout(1500)
  const [herdA, herdB] = await Promise.all([herdOf(a), herdOf(b)])
  expect(herdA.map(([id]) => id)).toEqual(herdB.map(([id]) => id))
  for (let i = 0; i < herdA.length; i++) expect(Math.hypot(herdA[i][1] - herdB[i][1], herdA[i][2] - herdB[i][2])).toBeLessThan(1.5)

  // Eleni throws two sticks a few steps away, out of everyone's reach; Nikos sees them land.
  await a.evaluate(() => {
    const { x, y, z } = window.__polis.player.body.position
    window.__polis.apply({ type: 'throw', stack: { item: 'stick', count: 2 }, from: [x + 3, y + 1, z], velocity: [0, 1, 0], delay: 0.2 })
  })
  const seen = () => b.evaluate(() => window.__polis.drops.find((drop) => drop.stack.item === 'stick')?.id ?? null)
  await expect.poll(seen).not.toBeNull()
  const id = (await seen())!
  await expect.poll(() => a.evaluate((drop) => window.__polis.drops.some((item) => item.id === drop), id)).toBe(true)
  await b.waitForTimeout(500)
  await expect.poll(() => b.evaluate((drop) => window.__polis.drops.some((item) => item.id === drop), id)).toBe(true)

  // Nikos stands where they fell and picks them up; they are in his backpack and gone for Eleni.
  const sticks = (page: Page) => page.evaluate(() => window.__polis.inventory.getState().slots.reduce((sum, slot) => sum + (slot?.item === 'stick' ? slot.count : 0), 0))
  const before = await sticks(b)
  await b.evaluate((drop) => {
    const item = window.__polis.drops.find((entry) => entry.id === drop)!
    Object.assign(window.__polis.player.body.position, { x: item.x, y: item.y, z: item.z })
  }, id)
  await expect.poll(() => sticks(b), { timeout: 10_000 }).toBe(before + 2)
  await expect.poll(() => a.evaluate((drop) => window.__polis.drops.some((item) => item.id === drop), id)).toBe(false)
})
