import pool from '../config/db.js'; // Import the pool we just created.

export const UserActions = {
    // This function handles "Creating" a user.
    async createUser(name, email, password, role) {
        // We use '?' as placeholders. This is called a "Prepared Statement."
        // It prevents hackers from stealing data via SQL Injection.
        const sql = `INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)`;
        
        // pool.execute sends the query AND the data separately.
        // The driver safely merges them before sending to the server.
        const [result] = await pool.execute(sql, [name, email, password, role]);
        
        return result; // Returns info like 'insertId' (the new user's ID).
    },

    async getAllUsers() {
        // [rows] uses "destructuring" to get only the data array from the response.
        const [rows] = await pool.execute('SELECT * FROM users');
        return rows;
    }
};