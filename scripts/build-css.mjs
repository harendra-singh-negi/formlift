// dist/style.css: Tailwind utilities from src/, every rule scoped to .fl-root (`@scope`) so the package's
// class names (bg-primary, text-muted…) never style anything in the host app.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const out = 'dist/style.css'
execFileSync('npx', ['@tailwindcss/cli', '-i', 'src/style.css', '-o', out, '--minify'], { stdio: 'inherit' })
const css = readFileSync(out, 'utf8')
const i = css.indexOf('@layer utilities{')
if (i < 0) throw new Error('utilities layer not found in Tailwind output')
// Wrap the utilities layer's content: @layer utilities{ @scope(.fl-root){ ... } }
let depth = 0
let end = -1
for (let j = i + '@layer utilities'.length; j < css.length; j++) {
  if (css[j] === '{') depth++
  else if (css[j] === '}' && --depth === 0) {
    end = j
    break
  }
}
const start = i + '@layer utilities{'.length
const scoped = `${css.slice(0, start)}@scope (.fl-root){${css.slice(start, end)}}${css.slice(end)}`
// Tailwind's theme variables (--spacing, --text-sm…) go on .fl-root, not :root, so a host using Tailwind keeps its own.
if (!scoped.includes('@layer theme{:root,:host{')) throw new Error('theme layer not found in Tailwind output')
writeFileSync(out, scoped.replace('@layer theme{:root,:host{', '@layer theme{.fl-root{'))
console.log(`${out}: theme and utilities scoped to .fl-root`)
