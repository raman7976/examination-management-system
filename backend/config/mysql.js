import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Immediate connection test
pool.getConnection()
    .then(conn => {
        console.log("✅ Database Connected");
        conn.release();
    })
    .catch(err => console.log("❌ DB Error:", err.message));

export default pool;