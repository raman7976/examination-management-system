// Idempotent migration: unfair-means cases recorded by the examination
// department (recorded_by) + evidence photographs. Safe to re-run — each step
// is probed first. Statements mirror 2026-10-30_unfair_means_photos.sql.
import db from '../config/mysql.js';
import { hasTable, hasColumn, hasFK, runSteps } from './_schemaProbes.js';

async function main() {
    const conn = await db.getConnection();
    try {
        await runSteps(conn, [
            {
                description: 'unfair_means_cases: add recorded_by',
                probe: async (c) => hasColumn(c, 'unfair_means_cases', 'recorded_by'),
                sql: 'ALTER TABLE unfair_means_cases ADD COLUMN recorded_by int DEFAULT NULL',
            },
            {
                description: 'unfair_means_cases: add recorded_by_name',
                probe: async (c) => hasColumn(c, 'unfair_means_cases', 'recorded_by_name'),
                sql: 'ALTER TABLE unfair_means_cases ADD COLUMN recorded_by_name varchar(100) DEFAULT NULL',
            },
            {
                description: 'unfair_means_cases: FK fk_ufm_recorder → users',
                probe: async (c) => hasFK(c, 'unfair_means_cases', 'fk_ufm_recorder'),
                sql: `ALTER TABLE unfair_means_cases
                      ADD CONSTRAINT fk_ufm_recorder FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL`,
            },
            {
                description: 'create unfair_means_photos',
                probe: async (c) => hasTable(c, 'unfair_means_photos'),
                sql: `CREATE TABLE unfair_means_photos (
                        id int NOT NULL AUTO_INCREMENT,
                        case_id int NOT NULL,
                        mime_type varchar(20) NOT NULL,
                        size_bytes int NOT NULL,
                        width int DEFAULT NULL,
                        height int DEFAULT NULL,
                        original_name varchar(255) DEFAULT NULL,
                        caption varchar(255) DEFAULT NULL,
                        data mediumblob NOT NULL,
                        uploaded_by int DEFAULT NULL,
                        uploaded_by_name varchar(100) DEFAULT NULL,
                        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (id),
                        KEY idx_ufm_photo_case (case_id),
                        CONSTRAINT fk_ufm_photo_case FOREIGN KEY (case_id) REFERENCES unfair_means_cases (id) ON DELETE CASCADE,
                        CONSTRAINT fk_ufm_photo_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
                      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
            },
        ]);
        console.log('\n✅ Unfair-means photos migration complete.');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        process.exit();
    }
}

main();
