import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from '../config/mysql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(join(__dirname, '2026-10-29_unfair_means.sql'), 'utf8');

const statements = sql
  .replace(/--.*$/gm, '')
  .split(';')
  .map(s => s.trim())
  .filter(Boolean);

(async () => {
  for (const stmt of statements) {
    console.log('Running:', stmt.slice(0, 80) + '...');
    await db.execute(stmt);
    console.log('  OK');
  }
  console.log('\nMigration complete.');
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
