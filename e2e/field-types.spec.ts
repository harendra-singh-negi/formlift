import { expect, test } from '@playwright/test'

// Every new field type: placed from the toolbox, then answered in Preview the way a person would.
test('new field types can be placed and answered', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  const doc = page.locator('[data-page="1"]')
  await expect(doc.locator('canvas')).toBeVisible()
  const tools = ['Multi-select', 'Checklist', 'Time', 'Date & time', 'Web address (URL)', 'Currency', 'Rating', 'Slider', 'Yes / No toggle']
  for (const [i, name] of tools.entries()) {
    await page.locator('aside').getByRole('button', { name, exact: true }).click()
    const box = (await doc.boundingBox())!
    // tap-to-place, down the right half of the page, clear of the demo's own fields
    await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * (0.08 + i * 0.075))
  }
  await page.getByRole('button', { name: 'Preview' }).click()

  const control = (label: string) => doc.getByLabel(label, { exact: true }).first()
  // multi-select: a dialog with every option
  await control('Multiselect').click()
  await page.getByRole('dialog').getByLabel('Option 2').check()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
  await expect(control('Multiselect')).toContainText('Option 2')
  // checklist: boxes right on the page
  await doc.getByRole('group', { name: 'Checklist' }).getByLabel('Option 1').check()
  await control('Time').fill('09:30')
  await control('Datetime').fill('2026-11-12T14:05')
  await control('Url').fill('https://example.com')
  await control('Currency').fill('12.5')
  await doc.getByRole('radio', { name: '4 of 5' }).click()
  await expect(doc.getByRole('radio', { name: '4 of 5' })).toHaveAttribute('aria-checked', 'true')
  await control('Slider').fill('70')
  const sw = doc.getByRole('switch')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  if (process.env.SHOT) {
    await page.waitForTimeout(400) // let the toggle finish sliding
    await page.screenshot({ path: process.env.SHOT, clip: { x: 700, y: 200, width: 400, height: 580 } })
  }
})

test('phone: a checklist and a currency amount open in a full-size dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  const doc = page.locator('[data-page="1"]')
  await expect(doc.locator('canvas')).toBeVisible()
  for (const [i, name] of ['Checklist', 'Currency'].entries()) {
    await page.locator('aside').getByRole('button', { name, exact: true }).click()
    const box = (await doc.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * (0.1 + i * 0.2))
  }
  await page.getByRole('button', { name: 'Preview' }).click()
  await page.setViewportSize({ width: 390, height: 780 }) // compact from here on

  await doc.getByRole('button', { name: 'Checklist', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Option 2').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(doc.getByRole('button', { name: 'Checklist', exact: true })).toContainText('Option 2')

  await doc.getByRole('button', { name: 'Currency', exact: true }).click()
  await dialog.getByLabel('Currency').fill('1a2.50')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(doc.getByRole('button', { name: 'Currency', exact: true })).toContainText('12.50') // letters dropped as typed
})
