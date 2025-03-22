const chalk = require('chalk');
const db = require('../db.js');
const express = require('express');
const router = express.Router();
const better_sqlite3 = require('better-sqlite3');

// Initialize coins database
const coinsDb = better_sqlite3('coins.db');

// Create coins table if it doesn't exist
coinsDb.prepare(`CREATE TABLE IF NOT EXISTS "coins" (
    "user_id" INTEGER PRIMARY KEY,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).run();

// Get user coins
async function getUserCoins(userId) {
    try {
        if (!userId) {
            return 0;
        }
        
        const stmt = coinsDb.prepare('SELECT amount FROM coins WHERE user_id = ?');
        const result = stmt.get(userId);
        
        return result ? result.amount : 0;
    } catch (error) {
        console.error(chalk.red(`[COINS] Error getting coins for user ${userId}:`), error);
        return 0;
    }
}

// Add coins to user
async function addCoins(userId, amount) {
    try {
        console.log(`[DEBUG][COINS] Starting addCoins(${userId}, ${amount})`);
        if (!userId) {
            console.error(`[DEBUG][COINS] Error: userId is missing or invalid: ${userId}`);
            throw new Error('User ID is required');
        }
        
        if (isNaN(amount) || amount <= 0) {
            console.error(`[DEBUG][COINS] Error: amount is invalid: ${amount}`);
            throw new Error('Amount must be a positive number');
        }
        
        console.log(`[DEBUG][COINS] Getting current balance for user ${userId}`);
        const currentCoins = await getUserCoins(userId);
        console.log(`[DEBUG][COINS] Current balance for user ${userId}: ${currentCoins}`);
        const newBalance = currentCoins + amount;
        console.log(`[DEBUG][COINS] New balance will be: ${newBalance}`);
        
        // Check if user exists in coins table
        console.log(`[DEBUG][COINS] Checking if user ${userId} exists in coins table`);
        const checkStmt = coinsDb.prepare('SELECT 1 FROM coins WHERE user_id = ?');
        const exists = checkStmt.get(userId);
        
        if (exists) {
            console.log(`[DEBUG][COINS] User ${userId} exists, updating record`);
            // Update existing record
            const stmt = coinsDb.prepare('UPDATE coins SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?');
            const result = stmt.run(newBalance, userId);
            console.log(`[DEBUG][COINS] Update result:`, result);
        } else {
            console.log(`[DEBUG][COINS] User ${userId} doesn't exist, creating new record`);
            // Insert new record
            const stmt = coinsDb.prepare('INSERT INTO coins (user_id, amount) VALUES (?, ?)');
            const result = stmt.run(userId, newBalance);
            console.log(`[DEBUG][COINS] Insert result:`, result);
        }
        
        console.log(chalk.green(`[COINS] Added ${amount} coins to user ${userId}. New balance: ${newBalance}`));
        return newBalance;
    } catch (error) {
        console.error(chalk.red(`[COINS] Error adding coins to user ${userId}:`), error);
        // Log the error stack trace
        console.error(`[DEBUG][COINS] Stack trace:`, error.stack);
        throw error;
    }
}

// Remove coins from user
async function removeCoins(userId, amount) {
    try {
        if (!userId) {
            throw new Error('User ID is required');
        }
        
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Amount must be a positive number');
        }
        
        const currentCoins = await getUserCoins(userId);
        
        if (currentCoins < amount) {
            throw new Error('Insufficient coins');
        }
        
        const newBalance = currentCoins - amount;
        
        // Check if user exists in coins table
        const checkStmt = coinsDb.prepare('SELECT 1 FROM coins WHERE user_id = ?');
        const exists = checkStmt.get(userId);
        
        if (exists) {
            // Update existing record
            const stmt = coinsDb.prepare('UPDATE coins SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?');
            stmt.run(newBalance, userId);
        } else {
            // This shouldn't happen normally, but insert new record just in case
            const stmt = coinsDb.prepare('INSERT INTO coins (user_id, amount) VALUES (?, ?)');
            stmt.run(userId, newBalance);
        }
        
        console.log(chalk.yellow(`[COINS] Removed ${amount} coins from user ${userId}. New balance: ${newBalance}`));
        return newBalance;
    } catch (error) {
        console.error(chalk.red(`[COINS] Error removing coins from user ${userId}:`), error);
        throw error;
    }
}

// Check if user has enough coins
async function hasEnoughCoins(userId, amount) {
    try {
        const currentCoins = await getUserCoins(userId);
        return currentCoins >= amount;
    } catch (error) {
        console.error(chalk.red(`[COINS] Error checking coins for user ${userId}:`), error);
        return false;
    }
}

// Set user coins to a specific amount
async function setCoins(userId, amount) {
    try {
        if (!userId) {
            throw new Error('User ID is required');
        }
        
        if (isNaN(amount) || amount < 0) {
            throw new Error('Amount must be a non-negative number');
        }
        
        // Check if user exists in coins table
        const checkStmt = coinsDb.prepare('SELECT 1 FROM coins WHERE user_id = ?');
        const exists = checkStmt.get(userId);
        
        if (exists) {
            // Update existing record
            const stmt = coinsDb.prepare('UPDATE coins SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?');
            stmt.run(amount, userId);
        } else {
            // Insert new record
            const stmt = coinsDb.prepare('INSERT INTO coins (user_id, amount) VALUES (?, ?)');
            stmt.run(userId, amount);
        }
        
        console.log(chalk.blue(`[COINS] Set coins for user ${userId} to ${amount}`));
        return amount;
    } catch (error) {
        console.error(chalk.red(`[COINS] Error setting coins for user ${userId}:`), error);
        throw error;
    }
}

// Get all users' coins data
async function getAllCoinsData() {
    try {
        const stmt = coinsDb.prepare('SELECT user_id, amount FROM coins');
        const results = stmt.all();
        
        // Convert array to object with user_id as keys
        const coinsData = {};
        for (const row of results) {
            coinsData[row.user_id] = row.amount;
        }
        
        return coinsData;
    } catch (error) {
        console.error(chalk.red('[COINS] Error getting all coins data:'), error);
        return {};
    }
}

// API Endpoints

// Get user's coin balance
router.get('/coins', async (req, res) => {
    try {
        if (!req.session.userinfo || !req.session.pterodactyl) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const userId = req.session.userinfo.id;
        const coins = await getUserCoins(userId);
        
        return res.json({ success: true, coins });
    } catch (error) {
        console.error(chalk.red('[COINS API] Error fetching coins:'), error);
        return res.status(500).json({ error: 'An error occurred while fetching coins' });
    }
});

// Admin endpoint to modify user coins
router.post('/admin/coins', async (req, res) => {
    try {
        // Verify admin status
        if (!req.session.userinfo || !req.session.pterodactyl || !req.session.isAdmin) {
            return res.status(403).json({ error: 'Forbidden - Admin access required' });
        }
        
        const { userId, amount, action } = req.body;
        
        if (!userId || !amount || !action) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        let newBalance = 0;
        
        switch (action) {
            case 'add':
                newBalance = await addCoins(userId, parseInt(amount));
                break;
            case 'remove':
                newBalance = await removeCoins(userId, parseInt(amount));
                break;
            case 'set':
                newBalance = await setCoins(userId, parseInt(amount));
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        
        return res.json({ success: true, newBalance });
    } catch (error) {
        console.error(chalk.red('[COINS API] Error modifying coins:'), error);
        return res.status(500).json({ error: error.message || 'An error occurred' });
    }
});

// Export router and functions
module.exports = {
    router,
    getUserCoins,
    addCoins,
    removeCoins,
    hasEnoughCoins,
    setCoins,
    getAllCoinsData
};
