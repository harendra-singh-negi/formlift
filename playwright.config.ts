import { defineConfig, devices } from '@playwright/test'

// Layout checks in a real browser (jsdom has no layout). Runs against the demo app; needs `npm run build` first
// for dist/style.css.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  // the demo runs on Vite's dev server, which transforms pdf.js's 1.3 MB worker on each load (~1 s, more with
  // parallel tests); a built app serves it as-is. Wait long enough for that.
  expect: { timeout: 15_000 },
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5199' },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
  },
})
