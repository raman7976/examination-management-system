// Idempotent migration: period-tag the rest of the pipeline (C2).
// Adds exam_period_id to exam_slots only. Other tables inherit via FK chain.
import db from '../config/mysql.js';
import { hasColumn, hasIndex, hasFK, runSteps } from './_schemaProbes.js';

async function main() {
    const conn = await db.getConnection();
    try {
        await runSteps(conn, [
            {
                description: 'exam_slots: add exam_period_id column',
                probe: async (c) => hasColumn(c, 'exam_slots', 'exam_period_id'),
                sql: `ALTER TABLE exam_slots ADD COLUMN exam_period_id INT NOT NULL DEFAULT 0`,
            },
            {
                description: 'exam_slots: backfill from active period',
                probe: async (c) => {
                    const [r] = await c.query('SELECT 1 FROM exam_slots WHERE exam_period_id = 0 LIMIT 1');
                    return r.length === 0;
                },
                sql: `UPDATE exam_slots
                      SET exam_period_id = (SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1)
                      WHERE exam_period_id = 0`,
            },
            {
                description: 'exam_slots: drop default on exam_period_id',
                probe: async (c) => {
                    const [r] = await c.query(
                        `SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_slots' AND COLUMN_NAME = 'exam_period_id'`
                    );
                    return r.length === 1 && r[0].COLUMN_DEFAULT === null;
                },
                sql: `ALTER TABLE exam_slots ALTER COLUMN exam_period_id DROP DEFAULT`,
            },
            {
                description: 'exam_slots: FK + index',
                probe: async (c) => hasFK(c, 'exam_slots', 'fk_slot_period'),
                sql: `ALTER TABLE exam_slots
                      ADD CONSTRAINT fk_slot_period FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE`,
            },
            {
                description: 'exam_slots: idx_period',
                probe: async (c) => hasIndex(c, 'exam_slots', 'idx_slot_period'),
                sql: `ALTER TABLE exam_slots ADD INDEX idx_slot_period (exam_period_id)`,
            },
        ]);
        console.log('\n✅ Pipeline period-tag migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
