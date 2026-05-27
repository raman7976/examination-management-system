// Idempotent migration: per-semester scoping for the course/enrollment/instructor tables.
// Adds `semester_label` everywhere it matters and drops the FKs that prevent
// composite-keyed uniqueness. Safe to re-run.
import db from '../config/mysql.js';
import { hasColumn, hasIndex, hasFK, pkColumns, runSteps } from './_schemaProbes.js';

async function main() {
    const conn = await db.getConnection();
    try {
        await runSteps(conn, [
            // ── courses ──────────────────────────────────────────────────────
            {
                description: 'courses: add semester_label column',
                probe: async (c) => hasColumn(c, 'courses', 'semester_label'),
                sql: `ALTER TABLE courses ADD COLUMN semester_label VARCHAR(50) NOT NULL DEFAULT ''`,
            },
            {
                description: 'courses: backfill semester_label from active period',
                probe: async (c) => {
                    const [r] = await c.query("SELECT 1 FROM courses WHERE semester_label = '' LIMIT 1");
                    return r.length === 0;
                },
                sql: `UPDATE courses
                      SET semester_label = (SELECT semester_label FROM exam_periods WHERE is_active = 1 LIMIT 1)
                      WHERE semester_label = ''`,
            },

            // Drop the FKs that point to courses.course_code (single-column).
            // Re-adding composite FKs would require including semester_label
            // everywhere — that's a much bigger refactor for minimal gain, so
            // we drop them and rely on app-level integrity.
            {
                description: 'course_enrollments: drop FK ibfk_2 (course_code → courses)',
                probe: async (c) => !(await hasFK(c, 'course_enrollments', 'course_enrollments_ibfk_2')),
                sql: `ALTER TABLE course_enrollments DROP FOREIGN KEY course_enrollments_ibfk_2`,
            },
            {
                description: 'course_instructors: drop FK ibfk_1 (course_code → courses)',
                probe: async (c) => !(await hasFK(c, 'course_instructors', 'course_instructors_ibfk_1')),
                sql: `ALTER TABLE course_instructors DROP FOREIGN KEY course_instructors_ibfk_1`,
            },
            {
                description: 'scheduled_exams: drop FK ibfk_2 (course_code → courses)',
                probe: async (c) => !(await hasFK(c, 'scheduled_exams', 'scheduled_exams_ibfk_2')),
                sql: `ALTER TABLE scheduled_exams DROP FOREIGN KEY scheduled_exams_ibfk_2`,
            },

            {
                description: 'courses: composite PK (semester_label, course_code)',
                probe: async (c) => {
                    const cols = await pkColumns(c, 'courses');
                    return cols.length === 2 && cols[0] === 'semester_label' && cols[1] === 'course_code';
                },
                sql: `ALTER TABLE courses
                      DROP PRIMARY KEY,
                      ADD PRIMARY KEY (semester_label, course_code),
                      ALTER COLUMN semester_label DROP DEFAULT`,
            },

            // ── course_enrollments ───────────────────────────────────────────
            {
                description: 'course_enrollments: add semester_label column',
                probe: async (c) => hasColumn(c, 'course_enrollments', 'semester_label'),
                sql: `ALTER TABLE course_enrollments ADD COLUMN semester_label VARCHAR(50) NOT NULL DEFAULT ''`,
            },
            {
                description: 'course_enrollments: backfill',
                probe: async (c) => {
                    const [r] = await c.query("SELECT 1 FROM course_enrollments WHERE semester_label = '' LIMIT 1");
                    return r.length === 0;
                },
                sql: `UPDATE course_enrollments
                      SET semester_label = (SELECT semester_label FROM exam_periods WHERE is_active = 1 LIMIT 1)
                      WHERE semester_label = ''`,
            },
            {
                description: 'course_enrollments: drop default + add unique key uq_enrollment',
                probe: async (c) => hasIndex(c, 'course_enrollments', 'uq_enrollment'),
                sql: `ALTER TABLE course_enrollments
                      ALTER COLUMN semester_label DROP DEFAULT,
                      ADD UNIQUE KEY uq_enrollment (semester_label, course_code, roll_number)`,
            },
            {
                description: 'course_enrollments: idx on semester_label',
                probe: async (c) => hasIndex(c, 'course_enrollments', 'idx_ce_semester'),
                sql: `ALTER TABLE course_enrollments ADD INDEX idx_ce_semester (semester_label)`,
            },

            // ── course_instructors ───────────────────────────────────────────
            {
                description: 'course_instructors: add semester_label column',
                probe: async (c) => hasColumn(c, 'course_instructors', 'semester_label'),
                sql: `ALTER TABLE course_instructors ADD COLUMN semester_label VARCHAR(50) NOT NULL DEFAULT ''`,
            },
            {
                description: 'course_instructors: backfill',
                probe: async (c) => {
                    const [r] = await c.query("SELECT 1 FROM course_instructors WHERE semester_label = '' LIMIT 1");
                    return r.length === 0;
                },
                sql: `UPDATE course_instructors
                      SET semester_label = (SELECT semester_label FROM exam_periods WHERE is_active = 1 LIMIT 1)
                      WHERE semester_label = ''`,
            },
            {
                description: 'course_instructors: drop default + add unique key uq_instructor',
                probe: async (c) => hasIndex(c, 'course_instructors', 'uq_instructor'),
                sql: `ALTER TABLE course_instructors
                      ALTER COLUMN semester_label DROP DEFAULT,
                      ADD UNIQUE KEY uq_instructor (semester_label, course_code, employee_id)`,
            },
            {
                description: 'course_instructors: idx on semester_label',
                probe: async (c) => hasIndex(c, 'course_instructors', 'idx_ci_semester'),
                sql: `ALTER TABLE course_instructors ADD INDEX idx_ci_semester (semester_label)`,
            },
        ]);
        console.log('\n✅ Semester-scope migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
