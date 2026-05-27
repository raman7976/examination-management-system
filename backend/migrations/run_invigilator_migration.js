// Idempotent migration: invigilator scheduling tables (2026-05-27).
// Safe to re-run. Each step probes schema state via information_schema
// before executing.
import db from '../config/mysql.js';
import { hasTable, hasColumn, hasIndex, hasFK, pkColumns, hasRow, runSteps } from './_schemaProbes.js';

async function main() {
    const conn = await db.getConnection();
    try {
        await runSteps(conn, [
            // ── invigilator_role_targets ──────────────────────────────────────
            {
                description: 'CREATE TABLE invigilator_role_targets',
                probe: async (c) => hasTable(c, 'invigilator_role_targets'),
                sql: `
                    CREATE TABLE invigilator_role_targets (
                        role          VARCHAR(20) NOT NULL PRIMARY KEY,
                        target_duties INT NOT NULL DEFAULT 0,
                        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            },
            {
                description: 'seed role rows',
                probe: async (c) => hasRow(c, 'invigilator_role_targets', '1 = 1'),
                sql: `INSERT IGNORE INTO invigilator_role_targets (role, target_duties)
                      VALUES ('faculty', 0), ('phd_student', 0), ('lab_staff', 0)`,
            },

            // ── invigilator_target_overrides ─────────────────────────────────
            {
                description: 'CREATE TABLE invigilator_target_overrides',
                probe: async (c) => hasTable(c, 'invigilator_target_overrides'),
                sql: `
                    CREATE TABLE invigilator_target_overrides (
                        user_id         INT NOT NULL PRIMARY KEY,
                        override_target INT NOT NULL,
                        note            VARCHAR(255),
                        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        CONSTRAINT fk_override_user
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            },

            // ── invigilator_assignments ──────────────────────────────────────
            {
                description: 'CREATE TABLE invigilator_assignments',
                probe: async (c) => hasTable(c, 'invigilator_assignments'),
                sql: `
                    CREATE TABLE invigilator_assignments (
                        id                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        slot_id              INT NOT NULL,
                        classroom_id         INT NOT NULL,
                        user_id              INT NOT NULL,
                        is_course_instructor TINYINT(1) NOT NULL DEFAULT 0,
                        created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_slot_room_user (slot_id, classroom_id, user_id),
                        UNIQUE KEY uq_slot_user      (slot_id, user_id),
                        INDEX idx_user (user_id),
                        INDEX idx_slot (slot_id),
                        CONSTRAINT fk_assign_slot      FOREIGN KEY (slot_id)      REFERENCES exam_slots(id) ON DELETE CASCADE,
                        CONSTRAINT fk_assign_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
                        CONSTRAINT fk_assign_user      FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            },
        ]);
        console.log('\n✅ Invigilator migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
