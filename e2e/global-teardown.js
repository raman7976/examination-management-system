// ═════════════════════════════════════════════════════════════════════════════
//  Playwright global teardown — the live-DB safety net.
//
//  Runs even when the suite fails. It (1) RESTORES the active period captured in
//  global-setup, so the live DB is left exactly as we found it, then (2) sweeps
//  every __TEST_E2E_ row in FK-safe order. Restore-first keeps a valid active
//  period in place at all times; the sweep then removes our (now-inactive) E2E
//  period and all its tagged children.
//
//  After this runs, a check of `exam_periods WHERE semester_label LIKE
//  '__TEST_E2E_%'` must return 0 rows and the original is_active=1 period must be
//  unchanged.
// ═════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, sweep, setActivePeriod } from './helpers/db.js';
import { AUTH_DIR } from './helpers/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function globalTeardown() {
  if (!process.env.DB_HOST) return; // nothing was provisioned

  let originalActivePeriodId = null;
  try {
    const raw = fs.readFileSync(path.join(AUTH_DIR, 'original-active.json'), 'utf8');
    originalActivePeriodId = JSON.parse(raw).originalActivePeriodId ?? null;
  } catch {
    console.warn('[e2e] teardown: could not read original-active.json; active period will NOT be restored.');
  }

  try {
    // 1. Restore the original active period first (keep DB consistent ASAP).
    if (originalActivePeriodId) {
      await setActivePeriod(originalActivePeriodId);
      console.log(`[e2e] restored original active period id = ${originalActivePeriodId}`);
    }
    // 2. Sweep every __TEST_E2E_ row (removes the now-inactive E2E period tree).
    await sweep();
    console.log('[e2e] swept all __TEST_E2E_ rows.');
  } finally {
    await closePool();
  }
}
