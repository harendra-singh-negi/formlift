import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// A table numbered 8. 9. 10.: the editor finds the last row's serial, the rows people add count on (11., 12.).
test('added table rows count on from the row\'s printed serial', async ({ page }) => {
  const pdf = await PDFDocument.create()
  const p = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  ;['8.', '9.', '10.'].forEach((t, i) => {
    const y = 700 - i * 30
    p.drawRectangle({ x: 40, y: y - 30, width: 515, height: 30, borderColor: rgb(0, 0, 0), borderWidth: 1 })
    p.drawLine({ start: { x: 90, y }, end: { x: 90, y: y - 30 }, thickness: 1 })
    p.drawText(t, { x: 50, y: y - 20, size: 12, font })
  })
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  page.on('dialog', (d) => void d.accept())
  await page.locator('input[type=file]').setInputFiles({ name: 't.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
  await expect(page.getByText(/Detecting fields/)).toBeHidden({ timeout: 60_000 })

  // a text box in row 10 (its cell, right of the serial), made repeatable
  const box = (await page.locator('[data-page="1"]').boundingBox())!
  await page.locator('aside').getByRole('button', { name: 'Text', exact: true }).first().click() // the field (the other adds page text)
  await page.mouse.click(box.x + box.width * (100 / 595), box.y + box.height * ((842 - 700 + 72) / 842))
  const panel = page.locator('aside').last()
  await panel.getByRole('spinbutton', { name: 'Top' }).fill('24.2') // row 10: 202–232 pt of 842
  await panel.getByRole('combobox', { name: 'Repeatable row' }).selectOption({ label: 'New repeatable row…' })
  await expect(panel.getByRole('combobox', { name: 'Serial number (10.)' })).toHaveValue('count')

  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await expect(doc.locator('canvas')).toBeVisible()
  await doc.getByRole('button', { name: 'Add row' }).click()
  await doc.getByRole('button', { name: 'Add row' }).click()
  await expect(doc.getByText('11.', { exact: true })).toBeVisible()
  await expect(doc.getByText('12.', { exact: true })).toBeVisible()
  await doc.getByText('11.', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/row-serial.png' })

  // the list reads the added rows the same way
  await page.getByRole('tab', { name: 'List' }).click()
  await expect(page.getByText('12.', { exact: true })).toBeVisible()
  await expect(page.getByText('11.', { exact: true })).toBeVisible()
})
