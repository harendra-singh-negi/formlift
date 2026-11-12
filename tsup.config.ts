import { defineConfig } from 'tsup'

const shared = { format: ['esm', 'cjs'] as ('esm' | 'cjs')[], dts: true, sourcemap: true, splitting: true, target: 'es2022' as const }

export default defineConfig([
  // core, React UI and server: React stays the app's own copy
  {
    ...shared,
    entry: { index: 'src/index.ts', 'react/index': 'src/react/index.ts', 'server/index': 'src/server/index.ts' },
    external: ['react', 'react-dom', 'pdfjs-dist', 'pdf-lib'],
    noExternal: ['lucide-react'], // only the icons used, so apps need not install it
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
