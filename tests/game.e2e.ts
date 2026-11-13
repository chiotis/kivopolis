import { expect, test, type Page } from '@playwright/test'
import { copy, itemName, missions } from '../src/game/el'
import { cellTotals, legacySlots } from '../src/game/blueprints/theatre'
import { Block } from '../src/voxel/blocks'
import { worldSaveKey } from '../src/voxel/world'
import { inventorySaveKey } from '../src/game/inventory'

const saveKey = 'ancient-polis-save'
const saved = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), saveKey)
const edits = async (page: Page) => {
  const pairs: number[] = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"edits":[]}').edits, worldSaveKey)
  return Object.fromEntries(pairs.flatMap((value, i) => (i % 2 ? [] : [[value, pairs[i + 1]]])))
}

/** Writes saves into the page's storage, then reloads so the game starts from them. */
async function seed(page: Page, entries: Record<string, unknown>) {
  await page.goto('/')
  await page.evaluate((items) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, JSON.stringify(value))
  }, entries)
  await page.reload()
}

async function startGame(page: Page, label = copy.start) {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText(copy.webgl)).toBeHidden()
  await page.getByRole('button', { name: label }).click()
}

async function walkUntil(page: Page, key: string, button: RegExp) {
  await page.keyboard.down(key)
  try {
    await page.getByRole('button', { name: button }).waitFor({ timeout: 15_000 })
  } finally {
    await page.keyboard.up(key)
  }
}

async function discover(page: Page) {
  await expect(page.locator('.scene-marker')).toBeVisible()
  await walkUntil(page, 'w', new RegExp(copy.interact))
  await page.keyboard.press('e')
  await expect(page.getByRole('heading', { name: missions.orchestra.title })).toBeVisible()
}

/** The stage resizes when the menu gives way to the game layout; wait until it settles. */
async function settledCanvas(page: Page) {
  let rect = (await page.locator('canvas').boundingBox())!
  await expect.poll(async () => {
    const next = (await page.locator('canvas').boundingBox())!
    const stable = next.x === rect.x && next.y === rect.y && next.width === rect.width && next.height === rect.height
    rect = next
    return stable
  }, { intervals: [250] }).toBe(true)
  await page.waitForTimeout(800)
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

async function lookDown(page: Page, center: { x: number; y: number }, pixels: number) {
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x, center.y + pixels, { steps: 4 })
  await page.mouse.up()
}

const noPointerLock = () => {
  // Headless pointer lock does not report synthetic mouse movement, so use the drag-to-look fallback.
  Element.prototype.requestPointerLock = () => Promise.reject(new Error('disabled in test'))
}

test('activates the plan and lays an orchestra block by hand in first person', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium')
  const errorsSeen: string[] = []
  page.on('pageerror', (error) => errorsSeen.push(error.message))
  await page.addInitScript(noPointerLock)
  await startGame(page)
  await discover(page)
  await expect(page.getByTestId('mission-count')).toHaveText(`0 / ${cellTotals.orchestra}`)
  await expect(page.getByRole('list', { name: copy.needs })).toContainText(itemName('ashlar'))

  // Stand on the skene site facing the orchestra with a stack of dressed stone in hand.
  await expect.poll(async () => (await saved(page))?.progress.discovered).toBe(true)
  const progress = (await saved(page)).progress
  const empty = Array.from({ length: 36 }, () => null)
  await seed(page, {
    [saveKey]: { version: 2, settings: (await saved(page)).settings, progress: { ...progress, player: [0, 0, 4.55] } },
    [inventorySaveKey]: { version: 1, slots: [{ item: 'ashlar', count: 8 }, ...empty.slice(1)], kilns: {} },
  })
  await page.getByRole('button', { name: copy.continue }).click()
  const center = await settledCanvas(page)
  // Look down into the trench of the orchestra ring just ahead and set one stone in it.
  await lookDown(page, center, 150)
  await page.mouse.click(center.x, center.y, { button: 'right' })
  await expect(page.getByTestId('mission-count')).toHaveText(`1 / ${cellTotals.orchestra}`)
  await expect.poll(async () => Object.values(await edits(page))).toContain(Block.ashlar)

  await page.reload()
  await page.getByRole('button', { name: copy.continue }).click()
  await expect(page.getByTestId('mission-count')).toHaveText(`1 / ${cellTotals.orchestra}`)
  expect(errorsSeen).toEqual([])
})

test('rebuilds an old prefab save as blocks and finishes with the tour', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium')
  const errorsSeen: string[] = []
  page.on('pageerror', (error) => errorsSeen.push(error.message))
  await seed(page, {
    [saveKey]: {
      version: 1,
      settings: { quality: 'auto', sound: false, reducedMotion: false },
      progress: {
        started: true, discovered: true, completed: false, history: [],
        placed: Object.values(legacySlots).flat(), player: [-6.15, 0, 6.8],
      },
    },
  })
  // The upgrade rewrites the save at once and stores the theatre as world edits.
  await expect.poll(async () => (await saved(page))?.version).toBe(2)
  expect((await saved(page)).progress.placed).toBeUndefined()
  await expect.poll(async () => Object.keys(await edits(page)).length).toBeGreaterThanOrEqual(332)

  await page.getByRole('button', { name: copy.continue }).click()
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await expect(page.getByTestId('points')).toHaveText((800).toLocaleString('el'))
  await walkUntil(page, 'w', new RegExp(copy.startTour))
  await page.keyboard.press('e')
  await page.getByRole('button', { name: copy.finishTour }).click()
  await expect(page.getByText(copy.finishTitle)).toBeVisible()
  await expect(page.getByRole('heading', { name: copy.agora })).toBeVisible()
  await expect.poll(async () => (await saved(page)).progress.completed).toBe(true)
  await expect(page.getByTestId('points')).toHaveText((1100).toLocaleString('el'))
  expect(errorsSeen).toEqual([])
})

test('shows the blueprint guide and the materials list on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'touch')
  await startGame(page)
  await discover(page)
  await expect(page.getByRole('list', { name: copy.needs })).toBeVisible()
  await expect(page.getByTestId('mission-count')).toHaveText(`0 / ${cellTotals.orchestra}`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('breaks a block by hand, picks up the drop, places it and keeps everything after refresh', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium')
  const slots = async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"slots":[]}').slots, inventorySaveKey)
  await page.addInitScript(noPointerLock)
  await startGame(page)
  const hotbar = page.getByRole('toolbar', { name: copy.hotbar })
  await expect(hotbar).toBeVisible()
  // The first-steps guide starts at the olive trunk.
  await expect(page.getByRole('region', { name: copy.guide })).toContainText(copy.guideSteps[0].title)
  const center = await settledCanvas(page)
  // Look down at the worn path in front of the spawn point.
  await lookDown(page, center, 150)

  // Path breaks by hand in 0.4 s of game time and drops soil; hold until it gives, as a player would.
  await page.mouse.down()
  try {
    await expect.poll(async () => Object.values(await edits(page)), { timeout: 15_000 }).toContain(Block.air)
  } finally {
    await page.mouse.up()
  }
  await page.keyboard.down('w')
  try {
    await expect(hotbar.getByRole('button', { name: `1: ${itemName('soil')}` })).toBeVisible({ timeout: 15_000 })
  } finally {
    await page.keyboard.up('w')
  }

  // A slow frame rate can let the held button break a second block, so compare against what is carried.
  await expect.poll(async () => (await slots())[0]?.item).toBe('soil')
  const carried: number = (await slots())[0].count
  await page.mouse.click(center.x, center.y, { button: 'right' })
  await expect.poll(async () => Object.values(await edits(page))).toContain(Block.soil)
  await expect.poll(async () => (await slots())[0]?.count ?? 0).toBe(carried - 1)

  // Crafting screen: E opens the backpack away from the signposts.
  await page.keyboard.press('e')
  await expect(page.getByRole('heading', { name: copy.backpack })).toBeVisible()
  await page.keyboard.press('e')
  await expect(page.getByRole('heading', { name: copy.backpack })).toBeHidden()

  const before = await edits(page)
  await page.reload()
  await page.getByRole('button', { name: copy.continue }).click()
  await expect(hotbar).toBeVisible()
  expect(await edits(page)).toEqual(before)
})

test('switches the browser to full screen and back from the top bar', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium')
  await startGame(page)
  const button = page.getByRole('button', { name: copy.fullscreen })
  await button.click()
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
  await page.getByRole('button', { name: copy.exitFullscreen }).click()
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
  await expect(button).toBeVisible()
})
