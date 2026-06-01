// ═════════════════════════════════════════════════════════════════════════════
//  Live-DB handle for E2E setup/teardown.
//
//  Connects to the SAME Aiven instance the app uses by loading backend/.env
//  (so the e2e package needs no creds of its own), with the identical TLS
//  options as backend/config/mysql.js. Used only by global-setup / global-
//  teardown / spec re-seeders to provision and sweep __TEST_E2E_ rows — the
//  browser drives everything else through the real HTTP API.
// ═════════════════════════════════════════════════════════════════════════════

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { E2E_MARKER } from './constants.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the backend's .env (one level up from e2e/) so DB_* + JWT_SECRET resolve.
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

let _pool;
export function pool() {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      ssl: { rejectUnauthorized: false },
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return _pool;
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}

const LIKE = (prefix) => `${prefix}%`;

// Prefix-scoped sweep — removes ONLY E2E rows, in FK-safe order. Idempotent so it
// can run after a crashed run too. Default marker is the broad `__TEST_E2E_`.
export async function sweep(prefix = E2E_MARKER) {
  const db = pool();
  const like = LIKE(prefix);

  // 1. Periods CASCADE through slots → scheduled_exams → seating_allocations and
  //    invigilator_assignments / swap_requests (all FK→exam_periods ON DELETE CASCADE).
  await db.query(`DELETE FROM exam_periods WHERE semester_label LIKE ?`, [like]);

  // 2. Exam sessions (tagged on academic_year); clear children defensively first.
  await db.query(
    `DELETE ess FROM exam_session_seating ess
       JOIN exam_sessions s ON ess.session_id = s.id
     WHERE s.academic_year LIKE ?`,
    [like],
  );
  await db.query(`DELETE FROM exam_sessions WHERE academic_year LIKE ?`, [like]);

  // 3. Semester-scoped tables (no FK to periods).
  await db.query(`DELETE FROM course_enrollments WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]);
  await db.query(`DELETE FROM course_instructors  WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]);
  await db.query(`DELETE FROM courses             WHERE semester_label LIKE ? OR course_code LIKE ?`, [like, like]);

  // 4. Global reference rows (their period-scoped children are already gone).
  await db.query(`DELETE FROM students   WHERE email LIKE ?`, [like]);
  await db.query(`DELETE FROM classrooms WHERE room_name LIKE ?`, [like]);
  await db.query(`DELETE FROM users      WHERE email LIKE ?`, [like]);
}

// Capture the id of the row that is currently is_active=1 so global-teardown can
// restore it after the run flips the active flag to the E2E period.
export async function getActivePeriodId() {
  const [rows] = await pool().query(`SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1`);
  return rows[0]?.id ?? null;
}

// Make `periodId` the sole active period. Used by global-setup to point the UI
// (which always reads the active period — it never passes ?period_id) at the
// E2E period, and by global-teardown to restore the captured original.
export async function setActivePeriod(periodId) {
  const db = pool();
  await db.query(`UPDATE exam_periods SET is_active = 0 WHERE is_active = 1`);
  if (periodId) await db.query(`UPDATE exam_periods SET is_active = 1 WHERE id = ?`, [periodId]);
}
