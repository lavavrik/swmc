import { expect, test, type Locator, type Page } from '@playwright/test'

/** Opens the component menu and places the named component. */
async function place(page: Page, name: string) {
  await page.getByTitle('Add component').first().click()
  // Match the item's own name, not its description, and not the toolbar button
  await page
    .locator('.picker .picker-item')
    .filter({ has: page.locator('.picker-item-name', { hasText: new RegExp(`^${name}$`) }) })
    .first()
    .click()
}

const nodes = (page: Page) => page.locator('[data-node-id]')

/** Centre of an element, in page coordinates. */
async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Replaces the whole script in the Monaco editor. */
async function typeScript(page: Page, source: string) {
  await page.locator('.lua-code .monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+a')
  // insertText goes straight into the model, past autocomplete and auto-closing
  await page.keyboard.insertText(source)
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

test('saves a microcontroller to the library and opens it again', async ({ page }) => {
  await place(page, 'Constant Number')
  await page.locator('.name-field').fill('Test Rig')

  await page.getByTitle('Save or export this microcontroller').click()
  await page.getByRole('button', { name: 'Save to library' }).click()

  await page.getByTitle('Discard and start again').click()
  await expect(nodes(page)).toHaveCount(0)

  await page.getByTitle('Open or import a microcontroller').click()
  await page.getByRole('button', { name: /Test Rig/ }).click()
  await expect(nodes(page)).toHaveCount(1)
  await expect(page.locator('.name-field')).toHaveValue('Test Rig')
})

test('imports a dropped-in file through the open dialog', async ({ page }) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<microprocessor name="Imported" description="" width="1" length="1">
	<nodes/>
	<group>
		<data><inputs/><outputs/></data>
		<components>
			<c type="15"><object id="1"><pos x="1" y="-1"/><n text="3" value="3"/></object></c>
		</components>
		<components_bridge/>
		<groups/>
	</group>
</microprocessor>`
  await page.getByTitle('Open or import a microcontroller').click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'imported.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(xml),
  })
  await expect(nodes(page)).toHaveCount(1)
  await expect(page.locator('.name-field')).toHaveValue('Imported')
})

test('runs the simulation and shows values on the wires', async ({ page }) => {
  await place(page, 'Constant Number')
  await page.locator('.panel input[type=number]').fill('12')
  await place(page, 'Absolute Value')
  await drag(page, await centre(nodes(page).nth(1)), { x: 640, y: 200 })

  const source = nodes(page).first().locator('[data-port-kind="out"]')
  const target = nodes(page).nth(1).locator('[data-port-kind="in"]').first()
  await drag(page, await centre(source), await centre(target))

  await page.getByTitle('Advance one tick').click()
  await expect(page.locator('.wire-value')).toHaveText(['12'])
  await expect(page.locator('.sim-tick')).toContainText('tick 1')

  await page.getByTitle('Reset the simulation').click()
  await expect(page.locator('.wire-value')).toHaveCount(0)
})

test('drives the graph from a microcontroller input pin', async ({ page }) => {
  await place(page, 'number input')
  await place(page, 'number output')
  await drag(page, await centre(nodes(page).nth(1)), { x: 700, y: 260 })

  const source = nodes(page).first().locator('[data-port-kind="out"]')
  const target = nodes(page).nth(1).locator('[data-port-kind="in"]').first()
  await drag(page, await centre(source), await centre(target))

  await page.locator('.pin-panel input[type=number]').fill('7')
  await page.getByTitle('Advance one tick').click()
  await expect(page.locator('.pin-panel .pin-value')).toHaveText('7')
})

test('runs a Lua script and draws it on the monitor', async ({ page }) => {
  await place(page, 'Lua Script')
  await page.getByRole('button', { name: 'Edit script' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()

  await typeScript(
    page,
    'function onDraw() screen.setColor(255,0,0) screen.drawRectF(0,0,32,32) end',
  )

  await page.getByRole('button', { name: 'Run simulation' }).click()

  // The preview is red once the script has drawn
  await expect
    .poll(
      async () =>
        page.locator('canvas.screen-preview').evaluate((canvas) => {
          const ctx = (canvas as HTMLCanvasElement).getContext('2d')
          const pixel = ctx?.getImageData(16, 16, 1, 1).data
          return pixel ? [pixel[0], pixel[1], pixel[2]].join(',') : ''
        }),
      { timeout: 15_000 },
    )
    .toBe('255,0,0')

  await expect(page.locator('.lua-error')).toHaveCount(0)
})

test('reports a Lua error without breaking the editor', async ({ page }) => {
  await place(page, 'Lua Script')
  await page.getByRole('button', { name: 'Edit script' }).click()
  await typeScript(page, 'function onTick( end')
  await page.getByRole('button', { name: 'Run simulation' }).click()
  await expect(page.locator('.lua-error')).toBeVisible({ timeout: 15_000 })
})
