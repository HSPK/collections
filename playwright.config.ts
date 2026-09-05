import { defineConfig, devices } from '@playwright/test';

// Workers share their run's directory; simultaneous project reviews never delete one another's traces.
const outputDir = process.env.ODD_TEST_OUTPUT_DIR || `test-results/run-${process.pid}`;
process.env.ODD_TEST_OUTPUT_DIR = outputDir;

export default defineConfig({
  testDir: './tests',
  outputDir,
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
      // Allow software WebGL without forcing the ordinary page compositor through it.
      args: ['--enable-unsafe-swiftshader', '--disable-accelerated-2d-canvas'],
    },
  },
  webServer: process.env.SITE_URL ? undefined : {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
