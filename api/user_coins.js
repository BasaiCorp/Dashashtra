const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

// Path to the coins data file
const COINS_DATA_FILE = path.join(__dirname, '../data/user_coins.json');

// Ensure the data directory exists
if (!fs.existsSync(path.join(__dirname, '../data'))) {
    fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
}

// Initialize coins data
let coinsData = {};

// Load coins data from file
function loadCoinsData() {
    try {
        if (fs.existsSync(COINS_DATA_FILE)) {
            const data = fs.readFileSync(COINS_DATA_FILE, 'utf8');
            coinsData = JSON.parse(data);
            console.log(chalk.green(`[COINS] Loaded coins data for ${Object.keys(coinsData).length} users`));
        } else {
            coinsData = {};
            saveCoinsData(); // Create the initial file
            console.log(chalk.yellow(`[COINS] Created new coins data file`));
        }
    } catch (error) {
        console.error(chalk.red(`[COINS] Error loading coins data:`), error);
        coinsData = {};
    }
}

// Save coins data to file
function saveCoinsData() {
    try {
        fs.writeFileSync(COINS_DATA_FILE, JSON.stringify(coinsData, null, 2));
    } catch (error) {
        console.error(chalk.red(`[COINS] Error saving coins data:`), error);
    }
}

// Initialize the coins data on module load
loadCoinsData();

// Get user coins
async function getUserCoins(userId) {
    try {
        if (!userId) {
            return 0;
        }
        
        // Convert userId to string for consistent lookup
        const userIdStr = String(userId);
        
        return coinsData[userIdStr] || 0;
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
        
        // Convert userId to string for consistent storage
        const userIdStr = String(userId);
        
        // Get current balance
        const currentCoins = await getUserCoins(userIdStr);
        console.log(`[DEBUG][COINS] Current balance for user ${userIdStr}: ${currentCoins}`);
        
        // Calculate new balance
        const newBalance = currentCoins + amount;
        console.log(`[DEBUG][COINS] New balance will be: ${newBalance}`);
        
        // Update coins data
        coinsData[userIdStr] = newBalance;
        
        // Save to file
        saveCoinsData();
        
        console.log(chalk.green(`[COINS] Added ${amount} coins to user ${userIdStr}. New balance: ${newBalance}`));
        return newBalance;
    } catch (error) {
        console.error(chalk.red(`[COINS] Error adding coins to user ${userId}:`), error);
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
        
        // Convert userId to string for consistent storage
        const userIdStr = String(userId);
        
        // Get current balance
        const currentCoins = await getUserCoins(userIdStr);
        
        if (currentCoins < amount) {
            throw new Error('Insufficient coins');
        }
        
        // Calculate new balance
        const newBalance = currentCoins - amount;
        
        // Update coins data
        coinsData[userIdStr] = newBalance;
        
        // Save to file
        saveCoinsData();
        
        console.log(chalk.yellow(`[COINS] Removed ${amount} coins from user ${userIdStr}. New balance: ${newBalance}`));
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
        
        // Convert userId to string for consistent storage
        const userIdStr = String(userId);
        
        // Update coins data
        coinsData[userIdStr] = amount;
        
        // Save to file
        saveCoinsData();
        
        console.log(chalk.blue(`[COINS] Set coins for user ${userIdStr} to ${amount}`));
        return amount;
    } catch (error) {
        console.error(chalk.red(`[COINS] Error setting coins for user ${userId}:`), error);
        throw error;
    }
}

// Get all users' coins data
async function getAllCoinsData() {
    return { ...coinsData };
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
    getAllCoinsData,
    loadCoinsData,
    saveCoinsData
};
