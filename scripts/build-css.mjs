// dist/style.css: Tailwind utilities from src/, every rule limited to .fl-root and its contents, so the package's
// class names (bg-primary, text-muted…) never style anything in the host app.
//
// Each utility selector gets `:where(.fl-root, .fl-root *)` on its last compound: it matches the .fl-root element
// itself (its own flex, h-full… classes) and everything inside it, adds no specificity, and works in every browser
// (unlike `@scope`, which older Firefox / Safari drop entirely, and which never matches the scoping root itself).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { transform } from 'lightningcss'

const out = 'dist/style.css'
execFileSync('npx', ['@tailwindcss/cli', '-i', 'src/style.css', '-o', out, '--minify'], { stdio: 'inherit' })
const css = readFileSync(out, 'utf8')

// The utilities layer's content: @layer utilities{ ... }
const i = css.indexOf('@layer utilities{')
if (i < 0) throw new Error('utilities layer not found in Tailwind output')
const start = i + '@layer utilities{'.length
let depth = 1
let end = start
for (; end < css.length && depth; end++) {
  if (css[end] === '{') depth++
  else if (css[end] === '}') depth--
}
end-- // at the layer's closing brace

const inRoot = {
  type: 'pseudo-class',
  kind: 'where',
  selectors: [
    [{ type: 'class', name: 'fl-root' }],
    [{ type: 'class', name: 'fl-root' }, { type: 'combinator', value: 'descendant' }, { type: 'universal' }],
  ],
}
let count = 0
const { code } = transform({
  filename: 'utilities.css',
  code: Buffer.from(css.slice(start, end)),
  minify: true,
  visitor: {
    Selector(sel) {
      // the last compound: after the last combinator; the scope goes before a pseudo-element (::placeholder)
      let at = sel.length
      for (let k = sel.length - 1; k >= 0 && sel[k].type !== 'combinator'; k--) {
        if (sel[k].type === 'pseudo-element') at = k
      }
      count++
      return [...sel.slice(0, at), inRoot, ...sel.slice(at)]
    },
  },
})
if (!count) throw new Error('no utility selectors found')

let result = `${css.slice(0, start)}${code.toString()}${css.slice(end)}`
// Tailwind's theme variables (--spacing, --text-sm…) go on .fl-root, not :root, so a host using Tailwind keeps its own.
if (!result.includes('@layer theme{:root,:host{')) throw new Error('theme layer not found in Tailwind output')
result = result.replace('@layer theme{:root,:host{', '@layer theme{.fl-root{')
writeFileSync(out, result)
console.log(`${out}: ${count} utility selectors limited to .fl-root`)
