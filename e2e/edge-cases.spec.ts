import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

// Corners of the new features that the happy-path tests don't reach.

const openLogic = async (page: Page, width = 1600, height = 1000) => {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Sample PDF' }).selectOption({ label: 'Form logic: groups, follow-ups, comments, your code' })
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
}

test('a required follow-up question left empty blocks Submit, and its badge turns red', async ({ page }) => {
  await openLogic(page)
  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await doc.getByRole('radio', { name: 'No' }).check()
  await page.getByRole('dialog', { name: /what is missing/ }).getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Submit' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click()
  await expect(page.locator('ul').filter({ hasText: 'What is missing? is required' })).toBeVisible()
  const badge = doc.getByRole('button', { name: 'More questions' })
  await expect(badge).toHaveClass(/text-danger/)
  // answering "Yes" closes the follow-up: its question no longer counts
  await doc.getByRole('radio', { name: 'Yes' }).check()
  await page.getByRole('button', { name: 'Submit' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click()
  await expect(page.locator('ul').filter({ hasText: 'What is missing?' })).toHaveCount(0)
})

test('list view: groups and follow-ups work there too; dialog-only questions are not listed', async ({ page }) => {
  await openLogic(page)
  await page.getByRole('tab', { name: /Fill/ }).click()
  await page.getByRole('tab', { name: 'List', exact: true }).click()
  const list = page.locator('.fl-root ul').first()
  await expect(list).toBeVisible()
  await expect(page.getByText('What is missing?')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Valid Yes' }).check()
  await page.getByRole('checkbox', { name: 'Valid N/A' }).check()
  await expect(page.getByRole('checkbox', { name: 'Valid Yes' })).not.toBeChecked()
  await page.getByRole('radio', { name: 'No' }).check()
  await expect(page.getByRole('dialog', { name: /what is missing/ })).toBeVisible()
})

test('phone: the advanced tour fits, badges stay on screen', async ({ page }) => {
  await openLogic(page, 390, 800)
  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await expect(doc.locator('canvas')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const bubble = doc.getByRole('button', { name: 'Add a comment' })
  await bubble.scrollIntoViewIfNeeded()
  // the page first draws at 100%, then fits the phone's width: measure once it has
  await expect.poll(async () => { const b = (await bubble.boundingBox())!; return b.x + b.width }).toBeLessThanOrEqual(390)
})

test('completed PDF with answers, follow-ups and comments downloads', async ({ page }) => {
  await openLogic(page)
  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await doc.getByRole('radio', { name: 'No' }).check()
  const d = page.getByRole('dialog', { name: /what is missing/ })
  await d.getByLabel('What is missing?').fill('Class')
  await d.getByRole('button', { name: 'Done' }).click()
  await doc.getByRole('button', { name: 'Add a comment' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Noted')
  await page.getByRole('dialog').getByRole('button', { name: 'Add comment' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save draft' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Completed PDF' }).click()])
  const bytes = await (await download.createReadStream()).toArray()
  const pdf = await PDFDocument.load(Buffer.concat(bytes))
  expect(pdf.getPageCount()).toBe(3) // form, additional answers, comments
})

test('editor: undo takes back a new group and a new follow-up question', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fl-sample', JSON.stringify('sample.pdf')))
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
  const fieldsTab = page.getByRole('tab', { name: /Fields \(/ })
  await expect(fieldsTab).not.toHaveText('Fields (0)') // the sample's own fields load after the canvas
  const before = await fieldsTab.textContent()
  await page.locator('aside').getByRole('button', { name: 'Radio group', exact: true }).click()
  const box = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.8)
  const panel = page.locator('aside').last()
  await panel.getByRole('combobox', { name: 'Add a question' }).selectOption({ label: 'Text' })
  await expect(page.getByRole('tab', { name: /Fields \(/ })).not.toHaveText(before!)
  await page.getByRole('button', { name: /Undo/ }).click() // the follow-up question
  await page.getByRole('button', { name: /Undo/ }).click() // the radio
  await expect(page.getByRole('tab', { name: /Fields \(/ })).toHaveText(before!)
})
