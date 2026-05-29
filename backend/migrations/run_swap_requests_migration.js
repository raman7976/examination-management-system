// Idempotent migration: invigilator_swap_requests table (peer/admin swap workflow).
// Safe to re-run; every step probes information_schema first.
import db from '../config/mysql.js';
import { hasTable, hasIndex, hasFK, runSteps } from './_schemaProbes.js';

async function main() {
    const conn = await db.getConnection();
    try {
        await runSteps(conn, [
            // ── Table ────────────────────────────────────────────────────────
            {
                description: 'CREATE TABLE invigilator_swap_requests',
                probe: async (c) => hasTable(c, 'invigilator_swap_requests'),
                sql: `
                    CREATE TABLE invigilator_swap_requests (
                        id                       INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        exam_period_id           INT NOT NULL,
                        requester_user_id        INT NOT NULL,
                        target_user_id           INT NOT NULL,
                        requester_assignment_id  INT NOT NULL,
                        target_assignment_id     INT NOT NULL,
                        status                   ENUM(
                            'pending_peer','pending_admin','approved',
                            'rejected_by_peer','rejected_by_admin','cancelled'
                        ) NOT NULL DEFAULT 'pending_peer',
                        note                     VARCHAR(500) NULL,
                        created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        peer_responded_at        TIMESTAMP NULL,
                        admin_responded_at       TIMESTAMP NULL,
                        cancelled_at             TIMESTAMP NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            },

            // ── Indexes ──────────────────────────────────────────────────────
            {
                description: 'idx_swap_requester (requester_user_id, status, created_at)',
                probe: async (c) => hasIndex(c, 'invigilator_swap_requests', 'idx_swap_requester'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD INDEX idx_swap_requester (requester_user_id, status, created_at DESC)`,
            },
            {
                description: 'idx_swap_target (target_user_id, status, created_at)',
                probe: async (c) => hasIndex(c, 'invigilator_swap_requests', 'idx_swap_target'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD INDEX idx_swap_target (target_user_id, status, created_at DESC)`,
            },
            {
                description: 'idx_swap_period (exam_period_id, status, created_at)',
                probe: async (c) => hasIndex(c, 'invigilator_swap_requests', 'idx_swap_period'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD INDEX idx_swap_period (exam_period_id, status, created_at DESC)`,
            },
            {
                description: 'idx_swap_pair (requester_assignment_id, target_assignment_id)',
                probe: async (c) => hasIndex(c, 'invigilator_swap_requests', 'idx_swap_pair'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD INDEX idx_swap_pair (requester_assignment_id, target_assignment_id)`,
            },

            // ── Foreign keys (all CASCADE) ───────────────────────────────────
            {
                description: 'fk_swap_period → exam_periods',
                probe: async (c) => hasFK(c, 'invigilator_swap_requests', 'fk_swap_period'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD CONSTRAINT fk_swap_period
                      FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE`,
            },
            {
                description: 'fk_swap_requester_user → users',
                probe: async (c) => hasFK(c, 'invigilator_swap_requests', 'fk_swap_requester_user'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD CONSTRAINT fk_swap_requester_user
                      FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE`,
            },
            {
                description: 'fk_swap_target_user → users',
                probe: async (c) => hasFK(c, 'invigilator_swap_requests', 'fk_swap_target_user'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD CONSTRAINT fk_swap_target_user
                      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE`,
            },
            {
                description: 'fk_swap_req_assign → invigilator_assignments',
                probe: async (c) => hasFK(c, 'invigilator_swap_requests', 'fk_swap_req_assign'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD CONSTRAINT fk_swap_req_assign
                      FOREIGN KEY (requester_assignment_id) REFERENCES invigilator_assignments(id) ON DELETE CASCADE`,
            },
            {
                description: 'fk_swap_tgt_assign → invigilator_assignments',
                probe: async (c) => hasFK(c, 'invigilator_swap_requests', 'fk_swap_tgt_assign'),
                sql: `ALTER TABLE invigilator_swap_requests
                      ADD CONSTRAINT fk_swap_tgt_assign
                      FOREIGN KEY (target_assignment_id) REFERENCES invigilator_assignments(id) ON DELETE CASCADE`,
            },
        ]);
        console.log('\n✅ Swap-requests migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
