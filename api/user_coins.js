const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

// Path to the coins data file in the cache folder
const COINS_DATA_FILE = path.join(__dirname, '../cache/user_coins.json');

// Ensure the cache directory exists
if (!fs.existsSync(path.join(__dirname, '../cache'))) {
    fs.mkdirSync(path.join(__dirname, '../cache'), { recursive: true });
}

// Initialize coins data
let coinsData = {};

// Load coins data from file
function loadCoinsData() {
    try {
        if (fs.existsSync(COINS_DATA_FILE)) {
            const data = fs.readFileSync(COINS_DATA_FILE, 'utf8');
            try {
                coinsData = JSON.parse(data);
                console.log(chalk.green(`[COINS] Loaded coins data for ${Object.keys(coinsData).length} users`));
            } catch (parseError) {
                console.error(chalk.red(`[COINS] Error parsing coins data file:`), parseError);
                // Create backup of corrupted file
                const backupFile = `${COINS_DATA_FILE}.backup.${Date.now()}`;
                fs.copyFileSync(COINS_DATA_FILE, backupFile);
                console.log(chalk.yellow(`[COINS] Created backup of corrupted file at ${backupFile}`));
                
                // Initialize with empty data
                coinsData = {};
                saveCoinsData();
            }
        } else {
            coinsData = {};
            saveCoinsData(); // Create the initial file
            console.log(chalk.yellow(`[COINS] Created new coins data file at ${COINS_DATA_FILE}`));
        }
    } catch (error) {
        console.error(chalk.red(`[COINS] Error loading coins data:`), error);
        coinsData = {};
    }
}

// Save coins data to file with proper error handling and atomic writes
function saveCoinsData() {
    try {
        // First write to a temporary file
        const tempFile = `${COINS_DATA_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(coinsData, null, 2));
        
        // Then rename the temporary file to the actual file (atomic operation)
        fs.renameSync(tempFile, COINS_DATA_FILE);
        
        // Create a backup every hour
        const now = new Date();
        if (now.getMinutes() === 0 && now.getSeconds() < 10) {
            const backupFile = `${COINS_DATA_FILE}.backup.${now.getTime()}`;
            fs.copyFileSync(COINS_DATA_FILE, backupFile);
            console.log(chalk.blue(`[COINS] Created hourly backup at ${backupFile}`));
            
            // Clean up old backups (keep only the last 24)
            cleanupBackups();
        }
    } catch (error) {
        console.error(chalk.red(`[COINS] Error saving coins data:`), error);
        
        // Try direct write if rename fails
        try {
            fs.writeFileSync(COINS_DATA_FILE, JSON.stringify(coinsData, null, 2));
        } catch (directWriteError) {
            console.error(chalk.red(`[COINS] Critical error: direct write failed:`), directWriteError);
        }
    }
}

// Clean up old backups, keeping only the last 24
function cleanupBackups() {
    try {
        const backupPrefix = path.basename(COINS_DATA_FILE) + '.backup.';
        const backupDir = path.dirname(COINS_DATA_FILE);
        
        const backupFiles = fs.readdirSync(backupDir)
            .filter(file => file.startsWith(backupPrefix))
            .map(file => path.join(backupDir, file))
            .sort((a, b) => {
                const timeA = parseInt(a.split('.').pop());
                const timeB = parseInt(b.split('.').pop());
                return timeB - timeA; // Descending order (newest first)
            });
        
        // Keep only the last 24 backups
        if (backupFiles.length > 24) {
            const filesToDelete = backupFiles.slice(24);
            filesToDelete.forEach(file => {
                try {
                    fs.unlinkSync(file);
                    console.log(chalk.yellow(`[COINS] Deleted old backup: ${file}`));
                } catch (error) {
                    console.error(chalk.red(`[COINS] Error deleting backup file ${file}:`), error);
                }
            });
        }
    } catch (error) {
        console.error(chalk.red(`[COINS] Error cleaning up backups:`), error);
    }
}

// Auto-save data periodically to ensure persistence
setInterval(saveCoinsData, 60000); // Save every minute

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
        
        // Save to file immediately after each transaction
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
        
        // Save to file immediately after each transaction
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
        
        // Save to file immediately
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
router.get('/balance', async (req, res) => {
    try {
        if (!req.session.userinfo || !req.session.pterodactyl) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const userId = req.session.userinfo.id;
        const balance = await getUserCoins(userId);
        
        return res.json({ success: true, balance });
    } catch (error) {
        console.error(chalk.red('[COINS API] Error fetching coins:'), error);
        return res.status(500).json({ error: 'An error occurred while fetching coins' });
    }
});

// Admin endpoint to modify user coins
router.post('/admin/modify', async (req, res) => {
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
        
        // Force a save after admin actions
        saveCoinsData();
        
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
