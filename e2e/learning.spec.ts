import { expect, test } from '@playwright/test'

// Auto-detect learns from a save: the demo keeps the lessons (onLesson) and passes them back (lessons). After
// "Start over" the page comes back as the admin left it, not as first suggested.

test('auto-detect learns from a save: Start over brings the changes back', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Sample PDF' }).selectOption({ label: 'Form' })
  await expect(page.getByRole('tab', { name: 'Fields (5)' })).toBeVisible()

  // The admin deletes "No" and renames "Site name", then saves.
  await page.getByRole('button', { name: 'Checkbox field No' }).click()
  await page.keyboard.press('Delete')
  await page.getByRole('button', { name: 'Text field Site name' }).click()
  await page.getByLabel('Label', { exact: true }).fill('Location')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fl-lessons') ?? '[]').length))
    .toBe(1)

  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.locator('.toast')).toContainText('4 fields suggested (4 from pages set up before)')
  await expect(page.getByRole('button', { name: 'Text field Location' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Checkbox field No' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Text field Location' }).click()
  await expect(page.getByText('Set up like this on the same page before. Check it.')).toBeVisible()

  // What it learnt, and forgetting the page: it is then detected again, with the rename it learnt.
  await page.getByRole('tab', { name: 'Learnt' }).click()
  await expect(page.getByText('renamed “Location”')).toBeVisible()
  await expect(page.getByText('1 page set up before comes back as set up.')).toBeVisible()
  await page.getByRole('button', { name: 'Text field Location' }).click()
  await page.getByRole('button', { name: 'Forget this' }).click()
  await expect(page.locator('.toast')).toContainText('Forgotten')
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fl-lessons') ?? '[]').length))
    .toBe(2)
  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.locator('.toast')).toContainText('5 fields suggested (1 as you set them up in other forms)')
  await expect(page.getByRole('button', { name: 'Text field Location' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Checkbox field No' })).toBeVisible()
})
