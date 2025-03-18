const bcrypt = require('bcrypt');
const db = require('../db.js');

async function editPassword(userId, newPassword) {
    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update the password in the database
        await db.users.updateUser(userId, {
            password: hashedPassword
        });
        
        console.log(`[SUCCESS] Password updated for user ID: ${userId}`);
    } catch (error) {
        console.error('[ERROR] Failed to update password:', error);
    }
}

// Get command line arguments
const userId = process.argv[2];
const newPassword = process.argv[3];

if (!userId || !newPassword) {
    console.log('Usage: node edit_password.js <userId> <newPassword>');
    process.exit(1);
}

// Run the password update
editPassword(userId, newPassword); 