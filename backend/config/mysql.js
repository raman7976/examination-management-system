import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

// TLS toggle. Defaults to ON (managed clouds like Aiven REQUIRE it). Set
// DB_SSL=false in .env for a plain on-prem / LAN MySQL that does not speak TLS,
// otherwise the handshake fails and the pool never connects.
const useSSL = process.env.DB_SSL !== 'false';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Immediate connection test. Skipped under test: the pool is lazy, so unit
// tests that merely import a module touching this file never open a socket
// (which would keep the event loop alive and hang `node --test`). Integration
// tests connect lazily on their first real query and close the pool in teardown.
if (process.env.NODE_ENV !== 'test') {
    pool.getConnection()
        .then(conn => {
            console.log("✅ Database Connected");
            conn.release();
        })
        .catch(err => console.log("❌ DB Error:", err.message));
}

export default pool;