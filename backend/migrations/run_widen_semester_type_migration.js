// Idempotent migration: widen exam_sessions.semester_type from varchar(10)
// to varchar(20) so "Summer Term" (11 chars) fits. Safe to re-run — probes
// information_schema.COLUMNS for the current length before altering.
import db from '../config/mysql.js';

async function currentLength(conn) {
    const [rows] = await conn.query(
        `SELECT CHARACTER_MAXIMUM_LENGTH AS len
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_sessions' AND COLUMN_NAME = 'semester_type'`
    );
    if (rows.length === 0) throw new Error('exam_sessions.semester_type column not found.');
    return rows[0].len;
}

async function main() {
    const conn = await db.getConnection();
    try {
        const len = await currentLength(conn);
        if (len >= 20) {
            console.log(`⤷ semester_type already varchar(${len}) — nothing to do.`);
            return;
        }
        await conn.query(`ALTER TABLE exam_sessions MODIFY COLUMN semester_type VARCHAR(20) NOT NULL`);
        console.log(`✓ widened semester_type: varchar(${len}) → varchar(20)`);
        console.log('\n✅ Migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.code || '', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
