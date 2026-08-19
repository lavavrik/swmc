import { expect, test, type Locator, type Page } from '@playwright/test'

/** Opens the component menu and places the named component. */
async function place(page: Page, name: string) {
  await page.getByTitle('Add component').first().click()
  // Scope to the picker: the toolbar has its own "Add component" button
  await page.locator('.picker').getByRole('button', { name, exact: false }).first().click()
}

const nodes = (page: Page) => page.locator('[data-node-id]')

/** Centre of an element, in page coordinates. */
async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Two moves: the machine needs a move event before the release
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('places a component from the picker', async ({ page }) => {
  await place(page, 'Constant Number')
  await expect(nodes(page)).toHaveCount(1)
  await expect(page.locator('.statusbar')).toContainText('1 components')
})

test('drags a component and snaps it to the grid', async ({ page }) => {
  await place(page, 'Constant Number')
  const node = nodes(page).first()
  const before = await node.getAttribute('transform')
  await drag(page, await centre(node), { x: 250, y: 330 })
  const after = await node.getAttribute('transform')
  expect(after).not.toBe(before)
  // Positions are whole grid units, so the transform holds whole multiples of 16
  const [x, y] = after!.match(/-?\d+(\.\d+)?/g)!.map(Number)
  expect(x! % 16).toBe(0)
  expect(y! % 16).toBe(0)
})

test('wires two compatible ports and refuses incompatible ones', async ({ page }) => {
  await place(page, 'Constant Number')
  await place(page, 'Add')
  await drag(page, await centre(nodes(page).nth(1)), { x: 620, y: 200 })

  const source = nodes(page).first().locator('[data-port-kind="out"]')
  const target = nodes(page).nth(1).locator('[data-port-kind="in"]').first()
  await drag(page, await centre(source), await centre(target))
  await expect(page.locator('.wire')).toHaveCount(1)

  // A number output cannot drive an on/off input
  await place(page, 'NOT')
  await drag(page, await centre(nodes(page).nth(2)), { x: 620, y: 380 })
  const onoffInput = nodes(page).nth(2).locator('[data-port-kind="in"]').first()
  await drag(page, await centre(source), await centre(onoffInput))
  await expect(page.locator('.wire')).toHaveCount(1)
})

test('marquee selects and deletes, and undo restores', async ({ page }) => {
  await place(page, 'Constant Number')
  await place(page, 'Add')
  await drag(page, await centre(nodes(page).nth(1)), { x: 300, y: 330 })

  await drag(page, { x: 120, y: 120 }, { x: 780, y: 400 })
  await expect(page.locator('.statusbar')).toContainText('2 selected')

  await page.keyboard.press('Delete')
  await expect(nodes(page)).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(nodes(page)).toHaveCount(2)
})

test('copies and pastes the selection', async ({ page }) => {
  await place(page, 'Constant Number')
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await expect(nodes(page)).toHaveCount(2)
  const positions = await nodes(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('transform')),
  )
  expect(positions[0]).not.toBe(positions[1])
})

test('pans the workspace with the middle button', async ({ page }) => {
  await place(page, 'Constant Number')
  const before = await nodes(page).first().boundingBox()
  await page.mouse.move(400, 250)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(500, 300)
  await page.mouse.up({ button: 'middle' })
  const after = await nodes(page).first().boundingBox()
  expect(after!.x).toBeGreaterThan(before!.x)
})
