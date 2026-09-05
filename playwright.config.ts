import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.SITE_URL || 'http://127.0.0.1:4173/',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      // Keep dense Canvas2D paths out of SwiftShader's software GPU compositor.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-accelerated-2d-canvas'],
    },
  },
  webServer: process.env.SITE_URL ? undefined : {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
