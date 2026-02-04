import pool from './config/db.js';

async function checkHealth() {
  try {
    console.log("🔍 Testing connection...");
    
    // 'SELECT 1' is the standard way to check if a DB is alive.
    // It doesn't need a table to exist, so it tests the connection itself.
    const [rows] = await pool.query("SELECT 1 + 1 AS result");
    
    if (rows[0].result === 2) {
      console.log("✅ SUCCESS: Database is connected and responding!");
    }
  } catch (error) {
    console.error("❌ CONNECTION FAILED:", error.message);
    console.log("\nPossible solutions:");
    console.log("1. Is your MySQL server running?");
    console.log("2. Does the DB_NAME in your .env exist in MySQL?");
    console.log("3. Is your password correct in .env?");
  } finally {
    process.exit(); // Close the script
  }
}

checkHealth();