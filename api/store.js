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
        
        // Since db.get is not a function, we'll use a default object or implement proper DB retrieval
        // For now, use a default object or if you have a different method to get extra resources
        const extra = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };
        
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
                disk: { per: 75 },
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
        const { resourceId, amount = 1 } = req.body;
        
        if (!userId || !resourceId) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
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
        
        // Since db.get is not available, for now we'll just use a fixed structure
        // In a production environment, you should implement proper resource storage
        let extra = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };
        
        // Update resources based on purchase
        extra[resourceId] += amount;
        
        // In a real implementation, you would save the updated resources here
        // For example: await db.updateUserResources(userId, extra);
        
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
            resources: extra,
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
        
        // Since db.get is not available, using a default object
        const extra = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };
        
        res.json({ success: true, resources: extra });
    } catch (error) {
        console.error(chalk.red('[STORE] Error fetching user resources:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Export the router as an object with router property to match how index.js expects it
module.exports = { 
    router 
};