import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Browsers before Chrome 128 / Firefox 134 / Safari 18.2 have no Promise.try, which pdf.js 5's modern build calls
// for every message: documents stopped partway ("Promise.try is not a function"). The legacy build polyfills it.
test('without Promise.try: a long document loads and auto-detect runs to the end', async ({ page }) => {
  await page.addInitScript(() => {
    delete (Promise as { try?: unknown }).try
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // 40 pages, each with an answer line under a label: something for auto-detect to find on every page
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 40; n++) {
    const p = pdf.addPage([595, 842])
    p.drawText(`Name ${n}:`, { x: 60, y: 760, size: 12, font })
    p.drawLine({ start: { x: 130, y: 758 }, end: { x: 400, y: 758 }, thickness: 0.7 })
  }
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  page.on('dialog', (d) => void d.accept())
  await page.locator('input[type=file]').setInputFiles({ name: 'long.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  await expect(page.locator('[data-page]')).toHaveCount(40)
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
  // pdf.js's legacy build put it back when it loaded
  expect(await page.evaluate(() => typeof (Promise as { try?: unknown }).try)).toBe('function')

  // auto-detect runs on new documents: wait until it has been through all 40 pages
  await expect(page.getByText(/Detecting fields/)).toBeHidden({ timeout: 60_000 })
  await expect(page.getByRole('tab', { name: /Fields \(/ })).toHaveText(/Fields \((4\d|[5-9]\d|\d{3,})\)/)
  expect(errors).toEqual([])
})
