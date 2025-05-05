const express = require('express');
const router = express.Router();
const db = require('../db.js');
const settings = require('../settings.json');

// Middleware to check if user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session.userinfo) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// Render AFK page
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        
        // Get user's AFK data
        let afkData = await db.afk.getUserAfkData(userId);
        
        // If no AFK data exists, create it
        if (!afkData) {
            await db.afk.createUserAfkData(userId);
            afkData = await db.afk.getUserAfkData(userId);
        }
        
        // Check if we need to reset daily count
        const today = new Date().toISOString().split('T')[0];
        if (afkData.last_afk_reset !== today) {
            await db.afk.resetDailyAfkCount(userId);
            afkData.daily_afk_count = 0;
        }
        
        // Calculate remaining AFK attempts
        const maxDailyAfk = 20;
        const remainingAfk = Math.max(0, maxDailyAfk - afkData.daily_afk_count);
        
        // Calculate time until next AFK is available
        let timeUntilNextAfk = 0;
        if (afkData.last_afk) {
            const lastAfkTime = new Date(afkData.last_afk);
            const now = new Date();
            const timeDiff = now - lastAfkTime;
            timeUntilNextAfk = Math.max(0, 60000 - timeDiff); // 60000ms = 1 minute
        }
        
        // Get user's coin balance
        const coins = await db.coins.getUserCoins(userId);
        
        // Prepare render data
        const renderData = {
            currentPage: 'afk',
            userData: req.session.userinfo,
            settings: settings,
            extra: {
                dashboard: {
                    title: 'Dashboard'
                }
            },
            afkData: {
                lastAfk: afkData.last_afk,
                dailyAfkCount: afkData.daily_afk_count,
                remainingAfk,
                timeUntilNextAfk
            },
            coins: coins
        };
        
        // Render the AFK page with the prepared data
        res.render('default/afk', renderData);
    } catch (error) {
        console.error('Error rendering AFK page:', error);
        res.status(500).send('An error occurred while loading the AFK page');
    }
});

// Start AFK session
router.post('/start', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        
        // Get user's AFK data
        let afkData = await db.afk.getUserAfkData(userId);
        
        // If no AFK data exists, create it
        if (!afkData) {
            await db.afk.createUserAfkData(userId);
            afkData = await db.afk.getUserAfkData(userId);
        }
        
        // Check if we need to reset daily count
        const today = new Date().toISOString().split('T')[0];
        if (afkData.last_afk_reset !== today) {
            await db.afk.resetDailyAfkCount(userId);
            afkData.daily_afk_count = 0;
        }
        
        // Check if user has reached daily limit
        if (afkData.daily_afk_count >= 20) {
            return res.status(400).json({
                success: false,
                message: 'You have reached the daily AFK limit. Please try again tomorrow.'
            });
        }
        
        // Check if enough time has passed since last AFK
        if (afkData.last_afk) {
            const lastAfkTime = new Date(afkData.last_afk);
            const now = new Date();
            const timeDiff = now - lastAfkTime;
            
            if (timeDiff < 60000) { // 60000ms = 1 minute
                return res.status(400).json({
                    success: false,
                    message: 'Please wait before starting another AFK session.'
                });
            }
        }
        
        // Update AFK data
        await db.afk.updateUserAfkData(userId, {
            last_afk: new Date().toISOString(),
            daily_afk_count: afkData.daily_afk_count + 1
        });
        
        // Add coins to user's balance
        await db.coins.updateUserCoins(userId, 2);
        
        res.json({
            success: true,
            message: 'AFK session started successfully',
            coins: await db.coins.getUserCoins(userId)
        });
    } catch (error) {
        console.error('Error starting AFK session:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while starting the AFK session'
        });
    }
});

// Get AFK status
router.get('/status', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        
        // Get user's AFK data
        let afkData = await db.afk.getUserAfkData(userId);
        
        // If no AFK data exists, create it
        if (!afkData) {
            await db.afk.createUserAfkData(userId);
            afkData = await db.afk.getUserAfkData(userId);
        }
        
        // Check if we need to reset daily count
        const today = new Date().toISOString().split('T')[0];
        if (afkData.last_afk_reset !== today) {
            await db.afk.resetDailyAfkCount(userId);
            afkData.daily_afk_count = 0;
        }
        
        // Calculate time until next AFK is available
        let timeUntilNextAfk = 0;
        if (afkData.last_afk) {
            const lastAfkTime = new Date(afkData.last_afk);
            const now = new Date();
            const timeDiff = now - lastAfkTime;
            timeUntilNextAfk = Math.max(0, 60000 - timeDiff);
        }
        
        res.json({
            success: true,
            data: {
                dailyAfkCount: afkData.daily_afk_count,
                remainingAfk: Math.max(0, 20 - afkData.daily_afk_count),
                timeUntilNextAfk,
                coins: await db.coins.getUserCoins(userId)
            }
        });
    } catch (error) {
        console.error('Error getting AFK status:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while getting AFK status'
        });
    }
});

// Export both the router and a function for compatibility
module.exports = router;
module.exports.router = router; 