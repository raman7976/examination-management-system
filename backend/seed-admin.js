// ═════════════════════════════════════════════════════════════════════════════
//  One-shot bootstrap: create (or reset the password of) an ADMIN login.
//
//  A freshly-imported schema has an empty `users` table, so nobody can log in.
//  Run this ONCE after loading schema.sql to mint the first admin. Re-running it
//  for an email that already exists just resets that admin's password (idempotent).
//
//  Login uses bcrypt, so the password must be hashed — never INSERT plaintext.
//
//  Usage (flags win over env vars):
//    node seed-admin.js --email admin@lnmiit.ac.in --password 'StrongPass123' \
//                       --name "Exam Cell Admin" [--emp-id E001] [--dept "Examinations"]
//
//  …or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME / ADMIN_EMP_ID / ADMIN_DEPT
//  in the environment (or .env) and run `node seed-admin.js`.
//
//  Reads the SAME DB_* / DB_SSL settings as the app (config/mysql.js), so once
//  .env points at the college server this script does too.
// ═════════════════════════════════════════════════════════════════════════════

import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// ── tiny --flag value parser ────────────────────────────────────────────────
function flag(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

const email = flag('email') || process.env.ADMIN_EMAIL;
const password = flag('password') || process.env.ADMIN_PASSWORD;
const fullName = flag('name') || process.env.ADMIN_NAME || 'Administrator';
const employeeId = flag('emp-id') || process.env.ADMIN_EMP_ID || null;
const department = flag('dept') || process.env.ADMIN_DEPT || null;

function fail(msg) {
    console.error(`\n❌ ${msg}\n`);
    console.error('Usage: node seed-admin.js --email <e> --password <p> [--name <n>] [--emp-id <id>] [--dept <d>]\n');
    process.exit(1);
}

if (!email) fail('Missing admin email (--email or ADMIN_EMAIL).');
if (!password) fail('Missing admin password (--password or ADMIN_PASSWORD).');
if (password.length < 8) fail('Password must be at least 8 characters (the app rejects shorter ones).');

// SSL toggle mirrors config/mysql.js: ON by default (Aiven), set DB_SSL=false for
// a plain LAN MySQL that does not speak TLS.
const useSSL = process.env.DB_SSL !== 'false';

const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
    const password_hash = await bcrypt.hash(password, 10);

    // Insert as admin; if the email already exists, reset its password + details.
    const [res] = await conn.query(
        `INSERT INTO users (full_name, email, role, employee_id, department, password_hash)
         VALUES (?, ?, 'admin', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            password_hash = VALUES(password_hash),
            full_name     = VALUES(full_name),
            role          = 'admin'`,
        [fullName, email, employeeId, department, password_hash],
    );

    const created = res.affectedRows === 1; // 1 = inserted, 2 = updated (MySQL convention)
    console.log(`\n✅ Admin ${created ? 'created' : 'updated'}: ${email}`);
    console.log(`   You can now log in at the portal with this email + the password you set.\n`);
} catch (err) {
    console.error(`\n❌ Failed to seed admin: ${err.code || ''} ${err.message}\n`);
    process.exitCode = 1;
} finally {
    await conn.end();
}
