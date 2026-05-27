// Idempotent migration: exam_periods + period-tag the 3 invigilator tables.
// Safe to re-run from any partial state.
import db from '../config/mysql.js';
import { hasTable, hasColumn, hasIndex, hasFK, pkColumns, runSteps } from './_schemaProbes.js';

async function main() {
    const conn = await db.getConnection();
    try {
        await runSteps(conn, [
            // ── exam_periods table ───────────────────────────────────────────
            {
                description: 'CREATE TABLE exam_periods',
                probe: async (c) => hasTable(c, 'exam_periods'),
                sql: `
                    CREATE TABLE exam_periods (
                        id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        semester_label  VARCHAR(50) NOT NULL,
                        exam_type       ENUM('midterm','endterm') NOT NULL,
                        is_active       TINYINT(1) NOT NULL DEFAULT 0,
                        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_period (semester_label, exam_type),
                        INDEX idx_active (is_active)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            },
            {
                description: 'seed default period',
                probe: async (c) => {
                    const [r] = await c.query('SELECT 1 FROM exam_periods LIMIT 1');
                    return r.length > 0;
                },
                sql: `INSERT INTO exam_periods (semester_label, exam_type, is_active)
                      VALUES ('Current Semester', 'midterm', 1)`,
            },

            // ── invigilator_role_targets ─────────────────────────────────────
            {
                description: 'role_targets: add exam_period_id column',
                probe: async (c) => hasColumn(c, 'invigilator_role_targets', 'exam_period_id'),
                sql: `ALTER TABLE invigilator_role_targets ADD COLUMN exam_period_id INT NOT NULL DEFAULT 0`,
            },
            {
                description: 'role_targets: backfill exam_period_id from active period',
                probe: async (c) => {
                    const [r] = await c.query('SELECT 1 FROM invigilator_role_targets WHERE exam_period_id = 0 LIMIT 1');
                    return r.length === 0;
                },
                sql: `UPDATE invigilator_role_targets
                      SET exam_period_id = (SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1)
                      WHERE exam_period_id = 0`,
            },
            {
                description: 'role_targets: composite PK (exam_period_id, role)',
                probe: async (c) => {
                    const cols = await pkColumns(c, 'invigilator_role_targets');
                    return cols.length === 2 && cols[0] === 'exam_period_id' && cols[1] === 'role';
                },
                sql: `ALTER TABLE invigilator_role_targets
                      DROP PRIMARY KEY,
                      ADD PRIMARY KEY (exam_period_id, role),
                      ALTER COLUMN exam_period_id DROP DEFAULT`,
            },
            {
                description: 'role_targets: FK to exam_periods',
                probe: async (c) => hasFK(c, 'invigilator_role_targets', 'fk_rt_period'),
                sql: `ALTER TABLE invigilator_role_targets
                      ADD CONSTRAINT fk_rt_period FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE`,
            },

            // ── invigilator_target_overrides ─────────────────────────────────
            {
                description: 'overrides: add exam_period_id column',
                probe: async (c) => hasColumn(c, 'invigilator_target_overrides', 'exam_period_id'),
                sql: `ALTER TABLE invigilator_target_overrides ADD COLUMN exam_period_id INT NOT NULL DEFAULT 0`,
            },
            {
                description: 'overrides: backfill exam_period_id',
                probe: async (c) => {
                    const [r] = await c.query('SELECT 1 FROM invigilator_target_overrides WHERE exam_period_id = 0 LIMIT 1');
                    return r.length === 0;
                },
                sql: `UPDATE invigilator_target_overrides
                      SET exam_period_id = (SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1)
                      WHERE exam_period_id = 0`,
            },
            {
                description: 'overrides: composite PK and FKs',
                probe: async (c) => {
                    const cols = await pkColumns(c, 'invigilator_target_overrides');
                    return cols.length === 2 && cols[0] === 'exam_period_id' && cols[1] === 'user_id';
                },
                sql: `ALTER TABLE invigilator_target_overrides
                      DROP FOREIGN KEY fk_override_user,
                      DROP PRIMARY KEY,
                      ADD PRIMARY KEY (exam_period_id, user_id),
                      ALTER COLUMN exam_period_id DROP DEFAULT,
                      ADD CONSTRAINT fk_override_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
            },
            {
                description: 'overrides: FK to exam_periods',
                probe: async (c) => hasFK(c, 'invigilator_target_overrides', 'fk_ov_period'),
                sql: `ALTER TABLE invigilator_target_overrides
                      ADD CONSTRAINT fk_ov_period FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE`,
            },

            // ── invigilator_assignments ──────────────────────────────────────
            {
                description: 'assignments: add exam_period_id column',
                probe: async (c) => hasColumn(c, 'invigilator_assignments', 'exam_period_id'),
                sql: `ALTER TABLE invigilator_assignments ADD COLUMN exam_period_id INT NOT NULL DEFAULT 0`,
            },
            {
                description: 'assignments: backfill exam_period_id',
                probe: async (c) => {
                    const [r] = await c.query('SELECT 1 FROM invigilator_assignments WHERE exam_period_id = 0 LIMIT 1');
                    return r.length === 0;
                },
                sql: `UPDATE invigilator_assignments
                      SET exam_period_id = (SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1)
                      WHERE exam_period_id = 0`,
            },
            {
                description: 'assignments: drop default on exam_period_id',
                probe: async (c) => {
                    const [r] = await c.query(
                        `SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invigilator_assignments' AND COLUMN_NAME = 'exam_period_id'`
                    );
                    return r.length === 1 && r[0].COLUMN_DEFAULT === null;
                },
                sql: `ALTER TABLE invigilator_assignments ALTER COLUMN exam_period_id DROP DEFAULT`,
            },
            {
                description: 'assignments: FK + index for exam_period_id',
                probe: async (c) => hasFK(c, 'invigilator_assignments', 'fk_ia_period'),
                sql: `ALTER TABLE invigilator_assignments
                      ADD CONSTRAINT fk_ia_period FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE`,
            },
            {
                description: 'assignments: idx_period',
                probe: async (c) => hasIndex(c, 'invigilator_assignments', 'idx_period'),
                sql: `ALTER TABLE invigilator_assignments ADD INDEX idx_period (exam_period_id)`,
            },

            // ── period-scoped unique keys (replaces global ones) ─────────────
            {
                description: 'assignments: drop redundant uq_slot_room_user (S2 cleanup)',
                probe: async (c) => !(await hasIndex(c, 'invigilator_assignments', 'uq_slot_room_user')),
                sql: `ALTER TABLE invigilator_assignments DROP INDEX uq_slot_room_user`,
            },
            {
                description: 'assignments: rebuild uq_slot_user to be period-scoped',
                probe: async (c) => {
                    // Check that uq_slot_user includes exam_period_id
                    const [r] = await c.query(
                        `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
                         FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invigilator_assignments'
                           AND INDEX_NAME = 'uq_slot_user'`
                    );
                    return r.length === 1 && r[0].cols && r[0].cols.includes('exam_period_id');
                },
                sql: `ALTER TABLE invigilator_assignments
                      DROP INDEX uq_slot_user,
                      ADD UNIQUE KEY uq_slot_user (slot_id, user_id, exam_period_id)`,
            },
        ]);
        console.log('\n✅ Periods migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
