import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '*.e2e.ts',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1360, height: 920 }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'touch', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      // The rooms test talks to its own room server (Phase 12).
      env: { VITE_ROOM_SERVER: 'ws://127.0.0.1:8788' },
    },
    {
      command: 'npm run server',
      url: 'http://127.0.0.1:8788/health',
      reuseExistingServer: true,
      env: { PORT: '8788', DATA_DIR: 'test-results/rooms' },
    },
  ],
})
