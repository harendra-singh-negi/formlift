import { expect, test, type Page } from '@playwright/test'

// The demo's two parts: Basic (every field type) and Advanced (form logic and your own code). Each row of their
// PDF says how to try the feature; these tests do exactly that.

const open = async (page: Page, label: string) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Sample PDF' }).selectOption({ label })
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
}

test('Basic: the demo opens on every field type, all 20 placed and explained', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('combobox', { name: 'Sample PDF' })).toHaveValue('tour:types')
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Fields (20)' })).toBeVisible()
  await expect(page.locator('.hint')).toContainText('Basic · Every field type')
  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await doc.getByLabel('Name', { exact: true }).fill('Asha')
  await doc.getByRole('radio', { name: '4 of 5' }).click()
  await doc.getByRole('switch').click()
  await expect(doc.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-basic.png` })
})

test('Advanced: groups, conditions, follow-up, comments and onFieldChange, as each row says', async ({ page }) => {
  await open(page, 'Form logic: groups, follow-ups, comments, your code')
  await expect(page.locator('.hint')).toContainText('Advanced · Form logic')
  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await expect(doc.locator('canvas')).toBeVisible()

  // group: exactly one
  await doc.getByRole('checkbox', { name: 'Valid Yes' }).check()
  await doc.getByRole('checkbox', { name: 'Valid No' }).check()
  await expect(doc.getByRole('checkbox', { name: 'Valid Yes' })).not.toBeChecked()

  // show when: Company appears for "Employed"
  await expect(doc.getByLabel('Company', { exact: true })).toHaveCount(0)
  await doc.getByLabel('Status', { exact: true }).selectOption('Employed')
  await expect(doc.getByLabel('Company', { exact: true })).toBeVisible()

  // read-only when
  await doc.getByLabel('Inspector', { exact: true }).fill('R. Rao')
  await doc.getByRole('checkbox', { name: 'Signed off' }).check()
  await expect(doc.getByLabel('Inspector', { exact: true })).toBeDisabled()

  // follow-up dialog on "No"
  await doc.getByRole('radio', { name: 'No' }).check()
  const followUp = page.getByRole('dialog', { name: 'Certificates: what is missing?' })
  await followUp.getByLabel('What is missing?').fill('Class certificate')
  await followUp.getByRole('button', { name: 'Done' }).click()
  await expect(doc.getByRole('button', { name: '1 more answer' })).toBeVisible()

  // comments
  await doc.getByRole('button', { name: 'Add a comment' }).click()
  const notes = page.getByRole('dialog', { name: /Comments/ })
  await notes.getByRole('textbox').fill('Seen on board')
  await notes.getByRole('button', { name: 'Add comment' }).click()
  await notes.getByRole('button', { name: 'Done' }).click()
  await expect(doc.getByRole('button', { name: '1 comment' })).toBeVisible()

  // your logic: a message over 10,000, a dialog for an incident
  await doc.getByLabel('Claim amount', { exact: true }).fill('12000')
  await expect(page.getByRole('status').filter({ hasText: 'manager' })).toBeVisible()
  await doc.getByRole('switch', { name: 'Incident' }).click()
  const incident = page.getByRole('dialog', { name: 'Incident details' })
  await expect(incident.getByLabel('When did it happen?')).toBeVisible()
  await incident.getByRole('button', { name: 'Done' }).click()
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-advanced.png` })

  // Submit: what is still missing shows (required when Delayed is off: no reason needed)
  await page.getByRole('button', { name: 'Submit' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click()
  await expect(page.locator('ul').filter({ hasText: 'is required' }).first()).toBeVisible()
})

test('Basic: a file can be attached and opened again (the demo keeps it in memory)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await doc.locator('input[type=file]').setInputFiles({ name: 'crew-list.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })
  await expect(doc.getByRole('button', { name: 'crew-list.txt' })).toBeVisible()
  await expect(page.locator('button[title="Download crew-list.txt"]')).toBeVisible() // attachments bar
})
