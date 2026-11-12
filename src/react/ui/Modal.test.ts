import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { THEME_VARS } from './Modal'

test('the modal carries every theme variable style.css defines into its portal', () => {
  const css = readFileSync('src/style.css', 'utf8') // vitest runs from the package root
  const defined = [...css.matchAll(/^\s*(--fl-[\w-]+):/gm)].map((m) => m[1])
  expect([...THEME_VARS].sort()).toEqual([...new Set(defined)].sort())
})
