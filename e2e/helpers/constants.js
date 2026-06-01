// ═════════════════════════════════════════════════════════════════════════════
//  Shared E2E identity / prefixing — the live-DB safety contract for Playwright.
//
//  Mirrors backend/tests/fixtures/constants.js, but uses a DISTINCT marker
//  (`__TEST_E2E_`) so the E2E sweep never touches the integration suite's rows
//  and vice-versa. Every row global-setup writes carries E2E_PREFIX; the
//  teardown sweeper deletes ONLY rows matching the broad `__TEST_E2E_` marker.
//
//  RUN_ID makes a single run's rows unique (CI passes TEST_RUN_ID per run) so
//  concurrent runs can't collide; the broad marker still mops up crashed runs.
// ═════════════════════════════════════════════════════════════════════════════

import 'dotenv/config';

// Broad marker — what the teardown sweep matches (catches ANY run's leftovers).
export const E2E_MARKER = '__TEST_E2E_';

export const RUN_ID = process.env.TEST_RUN_ID || String(Date.now());

// Per-run prefix for fresh rows. Long columns: semester_label(50), email(255),
// room_name(50), course_code(50), employee_id.
export const E2E_PREFIX = `${E2E_MARKER}${RUN_ID}_`;

// students.roll_number is varchar(20): keep its tag short + run-unique.
export const RUN_TAG = RUN_ID.slice(-6);
export const STUDENT_ROLL_PREFIX = `E${RUN_TAG}`;

const cap = (s, n = 50) => String(s).slice(0, n);

export const e2eEmail = (local) => cap(`${E2E_PREFIX}${local}@e2e.invalid`, 255);
export const e2eRoom = (name) => cap(`${E2E_PREFIX}${name}`);
export const e2eEmpId = (n) => cap(`${E2E_PREFIX}E${n}`);
export const e2eCourseCode = (n) => cap(`${E2E_PREFIX}C${n}`);
export const e2eSemester = (label) => cap(`${E2E_PREFIX}${label}`);
export const e2eRoll = (n) => cap(`${STUDENT_ROLL_PREFIX}${n}`, 20);

// Where global-setup writes per-role Playwright storageState files.
export const AUTH_DIR = new URL('../.auth/', import.meta.url).pathname;
export const STORAGE = {
  admin: `${AUTH_DIR}admin.json`,
  invA: `${AUTH_DIR}inv_a.json`,
  invB: `${AUTH_DIR}inv_b.json`,
};

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';
