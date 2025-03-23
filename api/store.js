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
        
        res.json({ 
            success: true, 
            resources: extra,
            balance: balance,
            prices: settings.api.client.coins.store || {
                ram: { per: 100 },
                disk: { per: 125 },
                cpu: { per: 150 },
                servers: { per: 200 }
            }
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
        
        if (!userId || !resourceId) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }
        
        // Map 'slot' to 'servers' for price checking
        if (resourceId === 'slot') {
            resourceId = 'servers';
        }
        
        // Get price settings
        const prices = settings.api.client.coins.store;
        if (!prices || !prices[resourceId] || !prices[resourceId].per) {
            return res.status(400).json({ success: false, error: 'Invalid resource type' });
        }
        
        // Calculate cost
        const cost = prices[resourceId].per * amount;
        
        // Check if user has enough coins
        const hasEnough = await userCoins.hasEnoughCoins(userId, cost);
        if (!hasEnough) {
            return res.status(400).json({ success: false, error: 'Insufficient credits' });
        }
        
        // Initialize resource update object
        let resourceUpdate = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };
        
        // Set resource amounts based on what's shown in the UI
        // Map 'slot' to 'servers' and use appropriate amounts for each resource
        if (resourceId === 'ram') {
            resourceUpdate.ram = 1024 * amount; // 1024 MB per RAM package as shown in UI
        } else if (resourceId === 'disk') {
            resourceUpdate.disk = 2048 * amount; // 2048 MB per disk package as shown in UI
        } else if (resourceId === 'cpu') {
            resourceUpdate.cpu = 100 * amount; // 100% per CPU package as shown in UI
        } else if (resourceId === 'servers') {
            resourceUpdate.servers = 1 * amount; // 1 server slot per package as shown in UI
        }
        
        // Save the updated resources to the database
        await db.resources.updateUserResources(userId, resourceUpdate);
        
        // Get the updated resources to return
        const updatedResources = await db.resources.getUserResources(userId);
        
        // Remove coins for purchase
        const newBalance = await userCoins.removeCoins(userId, cost);
        
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
        
        console.log(chalk.green(`[STORE] User ${userId} purchased ${amount} ${resourceId} for ${cost} credits. New balance: ${newBalance}`));
        
        res.json({
            success: true,
            newBalance,
            resources: updatedResources,
            message: 'Purchase successful'
        });
    } catch (error) {
        console.error(chalk.red('[STORE] Purchase error:'), error);
        res.status(500).json({ success: false, error: 'Failed to process purchase' });
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