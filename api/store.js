const express = require('express');
const router = express.Router();
const userCoins = require('./user_coins.js');
const chalk = require('chalk');
const db = require('../db.js');
const settings = require('../settings.json');

// Middleware to check if user is logged in
function checkAuth(req, res, next) {
    if (!req.session.userinfo || !req.session.pterodactyl) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// Get user's resource packages
router.get('/api/store/resources', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        
        // Get user resources from the database
        const extra = await db.resources.getUserResources(userId);
        
        // Get balance from user_coins module for accuracy
        const balance = await userCoins.getUserCoins(userId);
        
        // Update session with latest balance for template rendering
        if (!req.session.userinfo.coins) {
            req.session.userinfo.coins = balance;
        } else if (req.session.userinfo.coins !== balance) {
            req.session.userinfo.coins = balance;
            // Save session to ensure changes persist
            req.session.save(err => {
                if (err) console.error('Error saving session:', err);
            });
        }
        
        // Use the settings.api.client.coins.store or provide default prices
        const storeSettings = settings.api.client.coins.store || {};
        
        // Format prices with the correct property (cost instead of per)
        const prices = {
            ram: { 
                cost: (storeSettings.ram && storeSettings.ram.cost) || 100,
                name: "RAM Package",
                description: "Increase your server's memory capacity for better performance.",
                amount: 1024,
                unit: "MB"
            },
            disk: { 
                cost: (storeSettings.disk && storeSettings.disk.cost) || 125,
                name: "Disk Package",
                description: "Expand your server's storage capacity for more files and data.",
                amount: 2048,
                unit: "MB"
            },
            cpu: { 
                cost: (storeSettings.cpu && storeSettings.cpu.cost) || 150,
                name: "CPU Package",
                description: "Boost your server's processing power for better performance.",
                amount: 100,
                unit: "%"
            },
            servers: { 
                cost: (storeSettings.servers && storeSettings.servers.cost) || 200,
                name: "Server Slot Package",
                description: "Create an additional server to host more applications.",
                amount: 1,
                unit: "slot"
            },
            port: { 
                cost: (storeSettings.port && storeSettings.port.cost) || 150,
                name: "Port Package",
                description: "Add an additional port to your server for more connection options.",
                amount: 1,
                unit: "port"
            },
            database: { 
                cost: (storeSettings.database && storeSettings.database.cost) || 300,
                name: "Database Package",
                description: "Add a database to your server for data storage and management.",
                amount: 1,
                unit: "database"
            },
            backup: { 
                cost: (storeSettings.backup && storeSettings.backup.cost) || 250,
                name: "Backup Package",
                description: "Increase your server's backup limit for better data protection.",
                amount: 1,
                unit: "backup"
            },
            allocation: { 
                cost: (storeSettings.allocation && storeSettings.allocation.cost) || 200,
                name: "Allocation Package",
                description: "Add an additional IP allocation to your server.",
                amount: 1,
                unit: "allocation"
            }
        };
        
        res.json({ 
            success: true, 
            resources: extra,
            balance: balance,
            prices: prices
        });
    } catch (error) {
        console.error(chalk.red('[STORE] Error fetching resources:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Purchase resources
router.post('/api/store/purchase', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        let { resourceId, amount = 1 } = req.body;
        
        // Input validation
        if (!userId || !resourceId) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }
        
        // Validate amount is a positive integer
        amount = parseInt(amount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Amount must be a positive number' });
        }
        
        // Limit the maximum amount per purchase for security
        if (amount > 10) {
            return res.status(400).json({ success: false, error: 'Maximum purchase amount is 10 units' });
        }
        
        // Normalize resourceId - map 'slot' to 'servers' for consistency
        let normalizedResourceId = resourceId;
        if (resourceId === 'slot') {
            normalizedResourceId = 'servers';
        }
        
        // Resource definitions (what each purchase provides)
        const resourceDefinitions = {
            ram: { amount: 1024, unit: 'MB' },     // 1024 MB per RAM package
            disk: { amount: 2048, unit: 'MB' },    // 2048 MB per disk package
            cpu: { amount: 100, unit: '%' },       // 100% per CPU package
            servers: { amount: 1, unit: 'slot' },  // 1 server slot per package
            port: { amount: 1, unit: 'port' },     // 1 port per package
            database: { amount: 1, unit: 'db' },   // 1 database per package
            backup: { amount: 1, unit: 'backup' }, // 1 backup slot per package
            allocation: { amount: 1, unit: 'ip' }  // 1 IP allocation per package
        };
        
        // Validate resource type
        if (!resourceDefinitions[normalizedResourceId]) {
            return res.status(400).json({ success: false, error: 'Invalid resource type' });
        }
        
        // Get price settings from configuration
        const prices = settings.api.client.coins.store;
        if (!prices || !prices[normalizedResourceId]) {
            return res.status(400).json({ success: false, error: 'Price configuration is missing' });
        }
        
        // Calculate the correct cost
        // Fixed: Use the "cost" property for pricing instead of "per"
        const unitPrice = prices[normalizedResourceId].cost || 1; // Default to 1 if not set
        const cost = unitPrice * amount;
        
        console.log(chalk.blue(`[STORE] User ${userId} is attempting to purchase ${amount} ${normalizedResourceId} for ${cost} credits`));
        
        // Double-check user balance from coins service for accuracy
        const userBalance = await userCoins.getUserCoins(userId);
        
        // Check if user has enough coins
        if (userBalance < cost) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient credits. You need ${cost} credits, but only have ${userBalance}`,
                balance: userBalance,
                required: cost,
                missing: cost - userBalance
            });
        }
        
        // Initialize resource update object with zeros
        let resourceUpdate = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0,
            port: 0,
            database: 0,
            backup: 0,
            allocation: 0
        };
        
        // Set resource amount based on the resource definitions
        resourceUpdate[normalizedResourceId] = resourceDefinitions[normalizedResourceId].amount * amount;
        
        // First remove coins to ensure we don't grant resources without payment
        console.log(chalk.yellow(`[STORE] Removing ${cost} credits from user ${userId}`));
        const newBalance = await userCoins.removeCoins(userId, cost);
        
        // Save the updated resources to the database
        console.log(chalk.green(`[STORE] Adding ${resourceUpdate[normalizedResourceId]} ${resourceDefinitions[normalizedResourceId].unit} of ${normalizedResourceId} to user ${userId}`));
        await db.resources.updateUserResources(userId, resourceUpdate);
        
        // Force a save of the coins data
        await userCoins.saveCoinsData();
        
        // Get the updated resources to return
        const updatedResources = await db.resources.getUserResources(userId);
        
        // Update session with new balance for template rendering
        if (!req.session.userinfo.coins) {
            req.session.userinfo.coins = newBalance;
        } else {
            req.session.userinfo.coins = newBalance;
        }
        
        // Save session to ensure changes persist
        req.session.save(err => {
            if (err) console.error('Error saving session:', err);
        });
        
        console.log(chalk.green(`[STORE] User ${userId} successfully purchased ${amount} ${normalizedResourceId} for ${cost} credits. New balance: ${newBalance}`));
        
        // Return success with updated data
        res.json({
            success: true,
            newBalance,
            resources: updatedResources,
            message: `Successfully purchased ${amount} ${resourceId} for ${cost} credits`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(chalk.red('[STORE] Purchase error:'), error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process purchase', 
            message: error.message 
        });
    }
});

// Display user's current resources
router.get('/api/store/user/resources', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        
        // Get user resources from the database
        const resources = await db.resources.getUserResources(userId);
        
        res.json({ success: true, resources });
    } catch (error) {
        console.error(chalk.red('[STORE] Error fetching user resources:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Export the router as an object with router property to match how index.js expects it
module.exports = { 
    router 
};