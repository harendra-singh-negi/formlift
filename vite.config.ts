import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// The live demo only (npm run dev / npm run demo:build); the package itself is built by tsup.
// The aliases let the demo import 'formlift/...' exactly like an app that installed the package.
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))
// Google Analytics only when GA_ID is set (CI reads it from a repo secret); local dev and forks send nothing.
const GA_ID = process.env.GA_ID
const analytics = (): Plugin => ({
  name: 'analytics',
  transformIndexHtml: () =>
    GA_ID
      ? [
          { tag: 'script', attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${GA_ID}` }, injectTo: 'head' },
          { tag: 'script', children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)})`, injectTo: 'head' },
        ]
      : [],
})
export default defineConfig({
  root: 'example',
  base: './', // works under any Pages sub-path (/formlift/)
  plugins: [react(), analytics()],
  resolve: {
    alias: [
      { find: 'formlift/style.css', replacement: at('./dist/style.css') },
      { find: 'formlift/react', replacement: at('./src/react/index.ts') },
      // the built package, as an app gets it (npm run build first): zero-setup check in e2e/element.spec.ts
      { find: 'formlift/element', replacement: at('./dist/element/index.js') },
      { find: 'formlift/server', replacement: at('./src/server/index.ts') },
      { find: /^formlift$/, replacement: at('./src/index.ts') },
    ],
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: { input: { main: at('./example/index.html'), element: at('./example/element.html') } },
  },
})
