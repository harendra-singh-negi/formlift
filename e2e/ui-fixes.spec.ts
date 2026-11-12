import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Fixes from the UI review: each driven the way a person would hit it.

test('slider: the minimum can be chosen on an empty slider', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.getByRole('tab', { name: /Fill/ }).click()
  const slider = page.locator('[data-page="1"]').getByLabel('Fuel %', { exact: true })
  await slider.focus()
  await slider.press('Home') // already at 0: no input event; the key release takes it
  await expect(slider.locator('xpath=..')).toContainText('0')
  await page.getByRole('button', { name: 'Save draft' }).click() // the demo keeps answers on save
  await page.getByRole('tab', { name: /Code/ }).click()
  await expect(page.locator('pre').nth(1)).toContainText('"fuel": "0"')
})

test('editor: undo brings the options box back in step', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
  await page.getByRole('tab', { name: /Fields \(/ }).click()
  await page.locator('[data-fl-scroll] li').filter({ hasText: 'Flag' }).getByRole('button').first().click()
  const options = page.locator('aside').last().locator('textarea').first()
  await expect(options).toHaveValue('Panama\nLiberia\nMarshall Islands')
  await options.fill('Panama\nLiberia\nMarshall Islands\nMalta')
  await page.getByRole('button', { name: /Undo/ }).click()
  await expect(options).toHaveValue('Panama\nLiberia\nMarshall Islands')
})

test('editor: the fill-order list draws its rows all the way down', async ({ page }) => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 40; n++) {
    const p = pdf.addPage([595, 842])
    p.drawText(`Name ${n}:`, { x: 60, y: 760, size: 12, font })
    p.drawLine({ start: { x: 130, y: 758 }, end: { x: 400, y: 758 }, thickness: 0.7 })
  }
  await page.setViewportSize({ width: 1600, height: 700 })
  await page.goto('/')
  page.on('dialog', (d) => void d.accept())
  await page.locator('input[type=file]').setInputFiles({ name: 'l.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  // detection may not have started yet when the page shows: wait for its fields
  await expect(page.getByRole('tab', { name: /Fields \(/ })).toHaveText(/Fields \((4\d|[5-9]\d)\)/, { timeout: 60_000 })
  await page.getByRole('tab', { name: /Fields \(/ }).click()
  const box = page.locator('[data-fl-scroll]')
  await box.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(page.locator('[data-fl-scroll] li').filter({ hasText: 'p40' }).first()).toBeInViewport()
})

test('multi-select: choices picked in its dialog show in the box', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await doc.getByRole('button', { name: 'Cargo' }).click()
  await page.getByRole('dialog').getByLabel('Oil').check()
  await page.getByRole('dialog').getByLabel('Gas').check()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
  await expect(doc.getByRole('button', { name: 'Cargo' })).toContainText('Oil, Gas')
})
