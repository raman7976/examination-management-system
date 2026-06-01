// ═════════════════════════════════════════════════════════════════════════════
//  E2E Journey 1 — admin seating pipeline (on the active __TEST_E2E_ period).
//
//    Smart Scheduling (verify scheduled course)
//      → Seating Manager: Generate & Download Excel (algorithm runs)
//      → re-upload that exact workbook (KEY-ROW round-trip; strict reset)
//      → Micro-Seating View (plan view) renders.
//
//  Everything runs on the E2E period that global-setup activated, so the
//  destructive generate/upload (which hard-reset seating allocations within the
//  active period) only ever touch __TEST_E2E_ data — the live safety contract.
//
//  Requires both servers running (frontend :5173 + backend :5001) — or launch
//  with E2E_START_SERVERS=1. Validated structurally via `playwright test --list`.
// ═════════════════════════════════════════════════════════════════════════════

import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { readFixture } from '../helpers/fixture.js';
import { STORAGE } from '../helpers/constants.js';

let fx;

test.beforeAll(() => {
  fx = readFixture();
});

test.use({ storageState: STORAGE.admin });

test('admin: schedule visible → generate seating → re-upload → plan view', async ({ page }) => {
  // ── 1. Smart Scheduling — the pipeline course is already scheduled ─────────
  await page.goto('/dashboard/smart-scheduling');
  await page.getByRole('button', { name: 'Scheduled Courses' }).click();
  await expect(page.getByText(fx.pipeline.courseCode).first()).toBeVisible();

  // ── 2. Seating Manager — generate + download the colour-coded workbook ─────
  await page.goto('/dashboard/seating-manager');
  // The Generate button is `disabled` until the live-DB slot list has loaded AND
  // at least one slot has a scheduled exam (slotsWithExams > 0). Waiting for it to
  // become enabled is the robust "data is ready" signal — generous timeout to
  // absorb live-DB (Aiven) latency. (Avoids the ambiguous "With Exams" text, which
  // also substring-matches the "No slots with exams yet" placeholder.)
  const generateBtn = page.getByRole('button', { name: /Generate & Download Excel/ });
  await expect(generateBtn).toBeEnabled({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    generateBtn.click(),
  ]);
  const savedPath = path.join(os.tmpdir(), `e2e_seating_${fx.runId}.xlsx`);
  await download.saveAs(savedPath);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  // ── 3. Re-upload the same workbook (KEY-ROW round-trip, strict reset) ──────
  // The file input is hidden; setInputFiles works on it directly and triggers
  // the confirm modal.
  await page.setInputFiles('input[type="file"][accept=".xlsx"]', savedPath);
  await page.getByRole('button', { name: 'Yes, Reset & Upload' }).click();

  // Success toast reports exams processed + allocations saved. (.first() — the app
  // mounts two ToastContainers, so every toast resolves to two matching elements.)
  await expect(page.getByText(/Saved!/i).first()).toBeVisible({ timeout: 20_000 });

  // ── 4. Plan view renders ───────────────────────────────────────────────────
  await page.goto('/dashboard/seating-arrangement');
  await expect(page.getByRole('heading', { name: 'Micro-Seating View' })).toBeVisible();
});
