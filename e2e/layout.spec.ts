import { expect, test, type Page } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// What jsdom can't see: who scrolls, who stays put, and that the CSS stays inside the editor.

const openTab = async (page: Page, name: RegExp) => {
  await page.getByRole('tab', { name }).click()
}

/** Scroll the document by 300 px and report what moved. */
const scrollDocument = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.fl-root')!
    const doc = root.querySelector<HTMLElement>('[data-page]')!.parentElement!.parentElement!
    const aside = root.querySelector('aside')!
    const before = aside.getBoundingClientRect().top
    doc.scrollTop += 300
    root.scrollTop += 300
    return {
      docScrolled: doc.scrollTop,
      rootScrolled: root.scrollTop,
      asideMoved: before - aside.getBoundingClientRect().top,
      pageOverflow: document.documentElement.scrollHeight - innerHeight,
    }
  })

test('editor: only the document scrolls, the panels stay in view', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 })
  await page.goto('/')
  await expect(page.locator('[data-page]').first()).toBeVisible()
  const r = await scrollDocument(page)
  expect(r.docScrolled).toBeGreaterThan(0)
  expect(r.rootScrolled).toBe(0)
  expect(r.asideMoved).toBe(0)
  expect(r.pageOverflow).toBe(0)
})

test('editor root and its own classes are styled (flex column filling its box)', async ({ page }) => {
  await page.goto('/')
  const root = page.locator('.fl-root').first()
  await expect(root).toHaveCSS('display', 'flex')
  await expect(root).toHaveCSS('flex-direction', 'column')
})

test('a short container: the editor shrinks into it, the host page does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('/')
  await expect(page.locator('.fl-root').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0)
})

test('filler: the toolbar stays, the page does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 })
  await page.goto('/')
  await openTab(page, /Fill/)
  await expect(page.locator('[data-page]').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0)
})

test("utility classes don't leak into the host page", async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.fl-root').first()).toBeVisible()
  const display = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'flex hidden'
    document.body.prepend(el)
    return getComputedStyle(el).display
  })
  expect(display).toBe('block')
})

test('a dialog opens on document.body, styled and themed by its editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/')
  await openTab(page, /Fill/)
  await expect(page.locator('[data-page]').first()).toBeVisible()
  await page.evaluate(() => document.querySelector<HTMLElement>('.fl-root')!.style.setProperty('--fl-primary', 'rgb(255, 0, 0)'))
  // compact (phone): tapping a field's box opens it in a dialog
  await page.locator('.fl-root [data-page] button').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const info = await dialog.evaluate((d) => {
    const portal = d.closest('body > .fl-root') as HTMLElement | null
    return {
      inBody: !!portal,
      position: getComputedStyle(d.parentElement!).position,
      primary: portal && getComputedStyle(portal).getPropertyValue('--fl-primary').trim(),
    }
  })
  expect(info).toEqual({ inBody: true, position: 'fixed', primary: 'rgb(255, 0, 0)' })
})

test('a long document: only the pages near the screen are drawn, far ones are freed', async ({ page }) => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 300; n++) pdf.addPage([595, 842]).drawText(`Page ${n}`, { x: 60, y: 760, size: 24, font })
  await page.setViewportSize({ width: 1600, height: 800 })
  await page.goto('/')
  page.on('dialog', (d) => void d.accept()) // "discard changes?" when swapping documents
  await page.locator('input[type=file]').setInputFiles({
    name: 'long.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  })
  await expect(page.locator('[data-page]')).toHaveCount(300)
  const drawn = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLCanvasElement>('[data-page] canvas')].map((c) => c.closest<HTMLElement>('[data-page]')!.dataset.page),
    )
  await expect.poll(async () => (await drawn()).includes('1')).toBe(true)
  expect((await drawn()).length).toBeLessThan(10)
  // jump to the end: the first pages are freed, the last ones drawn
  await page.evaluate(() => document.querySelector('[data-page="300"]')!.scrollIntoView())
  await expect.poll(async () => (await drawn()).includes('300')).toBe(true)
  const after = await drawn()
  expect(after).not.toContain('1')
  expect(after.length).toBeLessThan(10)
})

test('phone: the Filters popover opens as a dialog that fits the screen, Escape closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/')
  await openTab(page, /Fill/)
  await page.getByRole('tab', { name: 'List', exact: true }).click()
  const filters = page.getByRole('button', { name: /Filters/ })
  test.skip((await filters.count()) === 0, 'the demo form has no filter groups')
  await filters.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
