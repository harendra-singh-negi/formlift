import { defineConfig, devices } from '@playwright/test'

// Layout checks in a real browser (jsdom has no layout). Runs against the demo app; needs `npm run build` first
// for dist/style.css.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5199' },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
  },
})
