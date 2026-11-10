import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', 'react/index': 'src/react/index.ts', 'server/index': 'src/server/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'lucide-react', 'pdfjs-dist', 'pdf-lib'],
})
