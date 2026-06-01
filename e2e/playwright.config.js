// ═════════════════════════════════════════════════════════════════════════════
//  Playwright config — live-DB E2E journeys (nightly / manual).
//
//  • Serialized (workers:1, fullyParallel:false): the suite mutates ONE shared
//    Aiven instance and flips the active period, so parallelism would race.
//  • globalSetup provisions + activates the __TEST_E2E_ period; globalTeardown
//    restores the captured active period and sweeps. Per-spec auth comes from
//    storageState files written by globalSetup (specs build per-role contexts).
//  • Servers: by default we assume both are already running (frontend :5173,
//    backend :5001). Set E2E_START_SERVERS=1 to have Playwright boot them.
// ═════════════════════════════════════════════════════════════════════════════

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL } from './helpers/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const START_SERVERS = process.env.E2E_START_SERVERS === '1';

export default defineConfig({
  testDir: './tests',
  // Shared live DB + active-period flip → must run one-at-a-time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: './global-setup.js',
  globalTeardown: './global-teardown.js',

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Optional: let Playwright start both servers. The backend listens only when
  // NODE_ENV !== 'test' (see backend/server.js), so we leave NODE_ENV unset.
  webServer: START_SERVERS
    ? [
        {
          command: 'npm start',
          cwd: path.join(repoRoot, 'backend'),
          // No health route exists; the catch-all returns 404, which Playwright
          // treats as "server up" (it only keeps retrying on ECONNREFUSED).
          url: 'http://localhost:5001/',
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'npm run dev',
          cwd: path.join(repoRoot, 'frontend'),
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ]
    : undefined,
});
