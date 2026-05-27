// Shared helper: resolve the active exam_period_id, used by every controller
// that needs to scope reads/writes to the current semester+exam pair.
//
// Resolution order:
//   1. explicit periodId argument (from req.query.period_id or req.body.period_id)
//   2. the single row in exam_periods with is_active = 1
//
// Throws an error with .http = 400 if no active period exists. Controllers
// can let this propagate to a `catch` block that maps .http → response status.

import db from '../config/mysql.js';

export async function resolveActivePeriod(connOrDb, explicitId) {
    if (explicitId) return Number(explicitId);
    const c = connOrDb || db;
    const [r] = await c.query('SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1');
    if (r.length === 0) {
        throw Object.assign(
            new Error('No active exam period. Create or activate one first.'),
            { http: 400 }
        );
    }
    return r[0].id;
}

export async function loadPeriod(connOrDb, periodId) {
    const c = connOrDb || db;
    const [r] = await c.query(
        'SELECT id, semester_label, exam_type, is_active FROM exam_periods WHERE id = ?',
        [periodId]
    );
    if (r.length === 0) {
        throw Object.assign(new Error('Exam period not found.'), { http: 404 });
    }
    return r[0];
}

// Convenience: just the semester_label string for the active (or explicit) period.
// Used by upload/scheduling controllers to tag rows in the per-semester tables
// (courses, course_enrollments, course_instructors).
export async function getActiveSemesterLabel(connOrDb, explicitId) {
    const periodId = await resolveActivePeriod(connOrDb, explicitId);
    const period = await loadPeriod(connOrDb, periodId);
    return period.semester_label;
}
