import { defineConfig } from 'tsup'

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
  // formlift/element: for apps without React, so React and the icons are bundled in
  {
    ...shared,
    entry: { 'element/index': 'src/element/index.ts' },
    external: ['pdfjs-dist', 'pdf-lib'],
    noExternal: ['react', 'react-dom', 'lucide-react', 'scheduler'],
    // the app does not build React itself here: ship React's production build, minified
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: true,
    sourcemap: false, // maps of minified React only add megabytes
  },
])
