import { UserActions } from './models/userModel.js'; // Import our helper functions.

async function start() {
    try {
        // We call our function and wait for it to finish.
        const newUser = await UserActions.createUser('Aishwarya', 'aish@example.com', '123', 'admin');
        console.log("User Created with ID:", newUser.insertId);

        // Fetch and display everyone in the table.
        const users = await UserActions.getAllUsers();
        console.table(users); // This prints a pretty table in your terminal!
        
    } catch (err) {
        // If the DB is down or the email is a duplicate, the code jumps here.
        console.error("Something went wrong:", err.message);
    }
}

start(); // Run the script.