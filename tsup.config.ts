import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

// formlift/element carries its CSS (built first by scripts/build-css.mjs) and pdf.js's legacy worker, so apps
// without React need no setup: no stylesheet to register, no worker asset to copy.
const builtIn = () => ({
  __FORMLIFT_CSS__: JSON.stringify(readFileSync('dist/style.css', 'utf8')),
  __FORMLIFT_PDF_WORKER__: JSON.stringify(readFileSync('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'utf8')),
})

const shared = { format: ['esm', 'cjs'] as ('esm' | 'cjs')[], dts: true, sourcemap: true, splitting: true, target: 'es2022' as const }

export default defineConfig([
  // core, React UI and server: React stays the app's own copy
  {
    ...shared,
    entry: { index: 'src/index.ts', 'react/index': 'src/react/index.ts', 'server/index': 'src/server/index.ts' },
    external: ['react', 'react-dom', 'pdfjs-dist', 'pdf-lib'],
    noExternal: ['lucide-react'], // only the icons used, so apps need not install it
    // Next.js App Router: formlift/react is client-only (hooks, DOM). Only that entry, so formlift/server stays
    // usable in server code. Added after the build since esbuild drops a directive on bundling.
    onSuccess: async () => {
      const { readFileSync, writeFileSync } = await import('node:fs')
      for (const f of ['dist/react/index.js', 'dist/react/index.cjs']) {
        const code = readFileSync(f, 'utf8')
        if (code.startsWith('"use client"')) continue
        writeFileSync(f, `"use client";\n${code}`)
        // keep the source map in line: one more generated line at the top
        const map = JSON.parse(readFileSync(`${f}.map`, 'utf8'))
        map.mappings = `;${map.mappings}`
        writeFileSync(`${f}.map`, JSON.stringify(map))
      }
    },
  },
  // formlift/element: for apps without React. React, the icons and pdf.js (its page and worker, one version)
  // are bundled in; pdf.js is a lazy chunk loaded with the first document.
  {
    ...shared,
    entry: { 'element/index': 'src/element/index.ts' },
    external: ['pdf-lib'],
    noExternal: ['react', 'react-dom', 'lucide-react', 'scheduler', 'pdfjs-dist'],
    // the app does not build React itself here: ship React's production build, minified
    define: { 'process.env.NODE_ENV': '"production"', ...builtIn() },
    minify: true,
    sourcemap: false, // maps of minified React only add megabytes
    // pdf.js's fake-worker fallback imports a runtime URL; minifying dropped its "ignore me" comments, so app
    // bundlers (Vite, webpack, Angular) warned about it. Put them back.
    onSuccess: async () => {
      const { readdirSync, readFileSync, writeFileSync } = await import('node:fs')
      for (const f of readdirSync('dist').filter((n) => /^pdf-.*\.c?js$/.test(n))) {
        const code = readFileSync(`dist/${f}`, 'utf8')
        writeFileSync(`dist/${f}`, code.replaceAll('import(this.workerSrc)', 'import(/* @vite-ignore */ /* webpackIgnore: true */ this.workerSrc)'))
      }
    },
  },
])
