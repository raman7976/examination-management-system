// ═════════════════════════════════════════════════════════════════════════════
//  Exam-period fixtures.
//
//  createTestPeriod() inserts an INACTIVE, __TEST_-tagged exam_periods row (so it
//  never disturbs the real active period) and seeds its invigilator_role_targets.
//  Integration tests then pass its id explicitly as ?period_id= / body.period_id,
//  riding resolveActivePeriod's "explicit id wins" lane — so the global active
//  flag is never touched for the common case.
//
//  withActivePeriod() is the ONLY sanctioned way to exercise controllers that
//  hard-reset the active period (scheduleBatchExams, uploadAndSaveSeating,
//  resetSemesterData, generate/clearSchedule): it captures the real active id,
//  flips to the test period, runs fn, and ALWAYS restores the original in a
//  finally block.
// ═════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import { TEST_PREFIX, RUN_ID } from '../fixtures/constants.js';

let seq = 0;
const ROLES = ['faculty', 'phd_student', 'lab_staff'];

// Create one inactive test period. `examType` must be 'midterm' | 'endterm'.
// Returns { id, semester_label, exam_type }.
export async function createTestPeriod({ examType = 'midterm', label, roleTargets } = {}) {
    seq += 1;
    const semester_label = `${TEST_PREFIX}${label || `P${seq}`}`.slice(0, 50);
    const [ins] = await db.query(
        `INSERT INTO exam_periods (semester_label, exam_type, is_active) VALUES (?, ?, 0)`,
        [semester_label, examType],
    );
    const id = ins.insertId;

    // Seed role targets so previewSchedule / generateSchedule have a baseline.
    const targets = roleTargets || { faculty: 3, phd_student: 3, lab_staff: 3 };
    for (const role of ROLES) {
        await db.query(
            `INSERT INTO invigilator_role_targets (exam_period_id, role, target_duties)
             VALUES (?, ?, ?)`,
            [id, role, targets[role] ?? 0],
        );
    }

    return { id, semester_label, exam_type: examType };
}

// Append ?period_id= to a path (for GET/DELETE query-string scoping).
export function periodQuery(path, periodId) {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}period_id=${periodId}`;
}

// Capture the live active period, activate `period`, run fn, restore in finally.
// Use ONLY for controllers that reset within the active period.
export async function withActivePeriod(period, fn) {
    const [prevRows] = await db.query(`SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1`);
    const prevId = prevRows[0]?.id ?? null;
    try {
        await db.query(`UPDATE exam_periods SET is_active = 0 WHERE is_active = 1`);
        await db.query(`UPDATE exam_periods SET is_active = 1 WHERE id = ?`, [period.id]);
        return await fn();
    } finally {
        await db.query(`UPDATE exam_periods SET is_active = 0 WHERE id = ?`, [period.id]);
        if (prevId) await db.query(`UPDATE exam_periods SET is_active = 1 WHERE id = ?`, [prevId]);
    }
}

// Unique semester label generator (for upload/course tests that need a label
// without a full period row). Always carries the run prefix.
export function testSemesterLabel(suffix = '') {
    seq += 1;
    return `${TEST_PREFIX}S${seq}_${RUN_ID}${suffix}`.slice(0, 50);
}
