import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The live demo only (npm run dev / npm run demo:build); the package itself is built by tsup.
// The aliases let the demo import 'formlift/...' exactly like an app that installed the package.
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  root: 'example',
  base: './', // works under any Pages sub-path (/formlift/)
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'formlift/style.css', replacement: at('./dist/style.css') },
      { find: 'formlift/react', replacement: at('./src/react/index.ts') },
      { find: 'formlift/server', replacement: at('./src/server/index.ts') },
      { find: /^formlift$/, replacement: at('./src/index.ts') },
    ],
  },
  build: { outDir: '../public', emptyOutDir: true },
})
