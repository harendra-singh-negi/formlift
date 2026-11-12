import { expect, test } from '@playwright/test'

// formlift/element in an app without React: no stylesheet, no worker asset, no setPdfWorker. The built package
// adds its CSS and brings pdf.js with its worker.
test('formlift/element works with no setup: styles, pdf.js worker, auto-detect', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/element.html')
  const root = page.locator('.fl-root').first()
  await expect(root).toHaveCSS('display', 'flex') // the CSS arrived by itself
  await expect(page.locator('style[data-formlift]')).toHaveCount(1)
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible() // pdf.js + its worker ran
  await expect(page.getByRole('tab', { name: /Fields \([1-9]/ })).toBeVisible() // auto-detect found fields
  // only the document scrolls here too
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0)
  expect(errors).toEqual([])
})

test('an app that imports formlift/style.css itself does not get it twice', async ({ page }) => {
  await page.goto('/element.html')
  await expect(page.locator('.fl-root').first()).toBeVisible()
  // the React demo imports the stylesheet: no injected copy there
  await page.goto('/')
  await expect(page.locator('.fl-root').first()).toBeVisible()
  await expect(page.locator('style[data-formlift]')).toHaveCount(0)
})

test('an app that themes formlift on :root (no stylesheet) still gets the CSS', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style')
      s.textContent = ':root { --fl-primary: #7c3aed }'
      document.head.append(s)
    })
  })
  await page.goto('/element.html')
  await expect(page.locator('.fl-root').first()).toHaveCSS('display', 'flex')
  await expect(page.locator('style[data-formlift]')).toHaveCount(1)
})
