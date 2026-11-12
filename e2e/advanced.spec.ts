import { expect, test, type Page } from '@playwright/test'

/** Tap a toolbox item, then the page at (fx, fy) of its width / height. The new field is selected. */
async function place(page: Page, tool: string, fx: number, fy: number) {
  await page.locator('aside').getByRole('button', { name: tool, exact: true }).click()
  const box = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
}

test('groups, follow-up dialogs and comments: built in the editor, used in the filler', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible()
  const panel = page.locator('aside').last()

  // Three boxes, one 'single' group, an answer required.
  for (const [i, y] of [0.6, 0.65, 0.7].entries()) {
    await place(page, 'Checkbox', 0.75, y)
    await panel.getByRole('combobox', { name: 'Group of boxes' }).selectOption(i === 0 ? { label: 'New group…' } : 'group_1')
  }
  await panel.getByRole('checkbox', { name: 'An answer is required' }).check()

  // A radio: "Option 2" asks a follow-up question; comments allowed.
  await place(page, 'Radio group', 0.6, 0.8)
  await panel.getByRole('checkbox', { name: 'Allow comments' }).check()
  await panel.getByRole('combobox', { name: 'Add a question' }).selectOption({ label: 'Text area' })
  await panel.getByRole('textbox', { name: 'Value', exact: true }).fill('Option 2')
  await panel.getByRole('textbox', { name: 'Dialog heading' }).fill('Why option 2?')

  await page.getByRole('tab', { name: /Fill/ }).click()
  const doc = page.locator('[data-page="1"]')
  await expect(doc.locator('canvas')).toBeVisible()

  // single group: the second tick unticks the first
  const boxes = doc.getByRole('checkbox', { name: 'Checkbox' })
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await expect(boxes.nth(0)).not.toBeChecked()
  await expect(boxes.nth(1)).toBeChecked()

  // the follow-up opens on "Option 2" and its answer is kept
  await doc.getByRole('radio', { name: 'Option 2' }).check()
  const dialog = page.getByRole('dialog', { name: 'Why option 2?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox').fill('Because')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
  await expect(doc.getByRole('button', { name: '1 more answer' })).toBeVisible()
  await doc.getByRole('button', { name: '1 more answer' }).click()
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue('Because')
  await page.keyboard.press('Escape')

  // a comment, with its author
  await doc.getByRole('button', { name: 'Add a comment' }).click()
  const notes = page.getByRole('dialog')
  await notes.getByRole('textbox').fill('Checked on board')
  await notes.getByRole('button', { name: 'Add comment' }).click()
  await expect(notes).toContainText('Demo user')
  await expect(notes).toContainText('Checked on board')
  await notes.getByRole('button', { name: 'Done' }).click()
  await expect(doc.getByRole('button', { name: '1 comment' })).toBeVisible()
})
