import { expect, test, type Page } from '@playwright/test'
import { copy, itemName, missions } from '../src/game/el'
import { cellTotals, legacySlots } from '../src/game/blueprints/theatre'
import { Block } from '../src/voxel/blocks'
import { DB_NAME, STORE, legacyKeys } from '../src/game/save'

const saveKey = legacyKeys.game

/** Every record of the IndexedDB save, with typed arrays turned into plain arrays. */
const records = (page: Page) => page.evaluate(async ([name, store]) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (!db.objectStoreNames.contains(store)) { db.close(); return {} as Record<string, any> }
  const tx = db.transaction(store)
  const read = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve) => { req.onsuccess = () => resolve(req.result) })
  const [keys, values] = await Promise.all([read(tx.objectStore(store).getAllKeys()), read(tx.objectStore(store).getAll())])
  db.close()
  const plain = (value: any): any => ArrayBuffer.isView(value) ? Array.from(value as Uint8Array)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) : value
  return Object.fromEntries(keys.map((key, i) => [String(key), plain(values[i])])) as Record<string, any>
}, [DB_NAME, STORE] as const)
const saved = async (page: Page) => (await records(page)).game ?? null
const inventorySlots = async (page: Page) => (await records(page)).inventory?.slots ?? []
const edits = async (page: Page) => {
  const result: Record<number, number> = {}
  for (const [key, value] of Object.entries(await records(page))) {
    if (!key.startsWith('chunk:')) continue
    value.cells.forEach((cell: number, i: number) => { result[cell] = value.ids[i] })
  }
  return result
}

/**
 * Writes version 1 LocalStorage saves, then reloads: the game moves them into IndexedDB at boot,
 * replacing whatever was saved there.
 */
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
    await page.getByRole('button', { name: button }).waitFor({ timeout: 30_000 })
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
  }, { intervals: [250], timeout: 20_000 }).toBe(true)
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
    [legacyKeys.inventory]: { version: 1, slots: [{ item: 'ashlar', count: 8 }, ...empty.slice(1)], kilns: {} },
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
  await expect.poll(async () => Object.keys(await edits(page)).length).toBeGreaterThanOrEqual(642)
  // The LocalStorage copy is gone once IndexedDB holds the save, so it is never imported twice.
  expect(await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), Object.values(legacyKeys))).toEqual([null, null, null])
  await page.reload()
  await expect.poll(async () => Object.keys(await edits(page)).length).toBeGreaterThanOrEqual(642)

  await page.getByRole('button', { name: copy.continue }).click()
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await expect(page.getByTestId('points')).toHaveText((1050).toLocaleString('el'))
  await walkUntil(page, 'w', new RegExp(copy.startTour))
  await page.keyboard.press('e')
  await page.getByRole('button', { name: copy.finishTour }).click()
  await expect(page.getByText(copy.finishTitle)).toBeVisible()
  await expect(page.getByRole('heading', { name: copy.agora })).toBeVisible()
  await expect.poll(async () => (await saved(page)).progress.completed).toBe(true)
  await expect(page.getByTestId('points')).toHaveText((1350).toLocaleString('el'))
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

test('holding a touch button never opens the system menu', async ({ page }, info) => {
  test.skip(info.project.name !== 'touch')
  await startGame(page)
  const forward = page.getByRole('button', { name: copy.moveUp })
  await expect(forward).toBeVisible()
  // A long press fires contextmenu on Android; the game must cancel it and block text selection.
  // (The iOS callout rule, -webkit-touch-callout, exists only in Safari, so Chromium cannot show it.)
  const result = await forward.evaluate((button) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    button.dispatchEvent(event)
    const style = getComputedStyle(button)
    return { cancelled: event.defaultPrevented, select: style.userSelect || style.webkitUserSelect }
  })
  expect(result).toEqual({ cancelled: true, select: 'none' })
})

test('breaks a block by hand, picks up the drop, places it and keeps everything after refresh', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium')
  const slots = () => inventorySlots(page)
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

test('hides the interface for pictures and saves the view as a PNG', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium')
  await startGame(page)
  const hotbar = page.getByRole('toolbar', { name: copy.hotbar })
  await expect(hotbar).toBeVisible()
  await page.getByRole('button', { name: copy.photoMode }).click()
  await expect(hotbar).toBeHidden()
  // F2 (or the camera button) downloads the current view.
  const download = page.waitForEvent('download')
  await page.keyboard.press('F2')
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^kivopolis-\d{8}-\d{6}\.png$/)
  // A PNG starts with the bytes 0x89 'P' 'N' 'G'.
  const chunks: Uint8Array[] = await (await file.createReadStream()).toArray()
  expect(new TextDecoder().decode(chunks[0].subarray(1, 4))).toBe('PNG')
  await page.keyboard.press('Escape')
  await expect(hotbar).toBeVisible()
  // Escape left screenshot mode without also opening the pause menu.
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.keyboard.press('F1')
  await expect(hotbar).toBeHidden()
  await page.keyboard.press('F1')
  await expect(hotbar).toBeVisible()
})

test('starts in creative mode: every material at hand, blocks placed without running out', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium')
  const slots = () => inventorySlots(page)
  await page.addInitScript(noPointerLock)
  await page.goto('/')
  await page.getByText(copy.modeCreative, { exact: true }).click()
  await page.getByRole('button', { name: copy.start }).click()
  await expect(page.getByText(` · ${copy.modeCreative}`)).toBeVisible()
  // No gathering guide in creative play, and the hotbar comes stocked with building stone.
  await expect(page.getByRole('region', { name: copy.guide })).toBeHidden()
  await expect.poll(async () => (await slots())[0]).toEqual({ item: 'ashlar', count: 64 })

  // The backpack shows the palette of every item instead of the crafting grid.
  await page.keyboard.press('e')
  await expect(page.getByRole('group', { name: copy.palette })).toBeVisible()
  await page.keyboard.press('e')

  const center = await settledCanvas(page)
  await lookDown(page, center, 150)
  await page.mouse.click(center.x, center.y, { button: 'right' })
  await expect.poll(async () => Object.values(await edits(page))).toContain(Block.ashlar)
  expect((await slots())[0]).toEqual({ item: 'ashlar', count: 64 })
  // A click breaks a block at once and drops nothing.
  await page.mouse.click(center.x, center.y)
  await expect.poll(async () => Object.values(await edits(page))).toContain(Block.air)
})
