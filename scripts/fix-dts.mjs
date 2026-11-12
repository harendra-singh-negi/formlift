// The .d.ts bundler writes inferred pdfjs types as imports from 'pdfjs-dist/types/src/display/api', a path
// pdfjs-dist does not export: TypeScript with moduleResolution node16 / nodenext then can't find them. Point them
// at the package root, which exports the same types, and fail on any other deep import.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const files = readdirSync('dist', { recursive: true })
  .map(String)
  .filter((f) => /\.d\.c?ts$/.test(f))
for (const f of files) {
  const path = join('dist', f)
  const code = readFileSync(path, 'utf8').replaceAll("from 'pdfjs-dist/types/src/display/api'", "from 'pdfjs-dist'")
  const deep = code.match(/from 'pdfjs-dist\/[^']+'/)
  if (deep) throw new Error(`${path}: ${deep[0]} is not exported by pdfjs-dist`)
  writeFileSync(path, code)
}
console.log(`dist: ${files.length} type files use only exported pdfjs-dist paths`)
