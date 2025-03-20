const express = require('express');
const router = express.Router();
const db = require('../db.js');
const chalk = require('chalk');
const fs = require('fs');

// Store user sessions and their last reward times
const userSessions = new Map();

// Middleware to check if user is logged in
function checkAuth(req, res, next) {
    if (!req.session.userinfo || !req.session.pterodactyl) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// Helper function to get render data
async function getRenderData(req, extraData = {}) {
    return {
        req: req,
        settings: JSON.parse(fs.readFileSync('./settings.json')),
        userinfo: req.session.userinfo,
        pterodactyl: req.session.pterodactyl,
        ...extraData
    };
}

// Page Routes
router.get('/earn', async (req, res) => {
    if (!req.session.userinfo || !req.session.pterodactyl) return res.redirect('/login');
    
    try {
        const renderData = await getRenderData(req, {
            referralLink: `${req.protocol}://${req.get('host')}/register?ref=${req.session.userinfo.id}`
        });
        
        res.render('default/earn', renderData);
    } catch (error) {
        console.error(chalk.red('[EARN] Error rendering earn page:'), error);
        res.status(500).send('An error occurred while loading the earn page');
    }
});

router.get('/afk', async (req, res) => {
    if (!req.session.userinfo || !req.session.pterodactyl) return res.redirect('/login');
    
    try {
        const renderData = await getRenderData(req, {
            propellerAdsZoneId: process.env.PROPELLER_ADS_ZONE_ID || ''
        });
        
        res.render('default/afk', renderData);
    } catch (error) {
        console.error(chalk.red('[AFK] Error rendering AFK page:'), error);
        res.status(500).send('An error occurred while loading the AFK page');
    }
});

// API Routes
router.post('/api/earn/afk', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        const now = Date.now();
        const userSession = userSessions.get(userId) || { lastReward: 0, timeActive: 0 };
        
        // Check if 5 minutes have passed since last reward
        if (now - userSession.lastReward < 300000) {
            return res.status(429).json({ 
                success: false, 
                error: 'Please wait before claiming another reward',
                timeRemaining: 300000 - (now - userSession.lastReward)
            });
        }
        
        // Calculate credits (20 credits per 5 minutes = 100 credits per hour)
        const credits = 20;
        
        // Update user's credits in database
        const currentCoins = await db.get(`coins-${userId}`) || 0;
        await db.set(`coins-${userId}`, currentCoins + credits);
        
        // Update session data
        userSession.lastReward = now;
        userSession.timeActive = (userSession.timeActive || 0) + 300;
        userSessions.set(userId, userSession);
        
        console.log(chalk.green(`[EARN] User ${userId} earned ${credits} credits from AFK`));
        res.json({ success: true, credits });
    } catch (error) {
        console.error(chalk.red('[EARN] Error processing AFK reward:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.post('/api/earn/daily', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        const lastDaily = await db.get(`daily-${userId}`) || 0;
        const now = Date.now();
        
        if (now - lastDaily < 86400000) {
            return res.status(429).json({ 
                success: false, 
                error: 'Daily reward already claimed',
                timeRemaining: 86400000 - (now - lastDaily)
            });
        }
        
        const credits = 50;
        const currentCoins = await db.get(`coins-${userId}`) || 0;
        await db.set(`coins-${userId}`, currentCoins + credits);
        await db.set(`daily-${userId}`, now);
        
        console.log(chalk.green(`[EARN] User ${userId} claimed daily reward of ${credits} credits`));
        res.json({ success: true, credits });
    } catch (error) {
        console.error(chalk.red('[EARN] Error processing daily reward:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.get('/api/earn/leaderboard', async (req, res) => {
    try {
        const leaderboard = Array.from(userSessions.entries())
            .map(([userId, session]) => ({
                userId,
                timeActive: session.timeActive || 0,
                credits: session.credits || 0
            }))
            .sort((a, b) => b.timeActive - a.timeActive)
            .slice(0, 10);
        
        const users = await Promise.all(leaderboard.map(async (entry) => {
            const user = await db.get(`user-${entry.userId}`);
            return {
                username: user?.username || 'Unknown User',
                timeActive: formatTime(entry.timeActive),
                credits: entry.credits
            };
        }));
        
        res.json({ success: true, users });
    } catch (error) {
        console.error(chalk.red('[EARN] Error fetching leaderboard:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Helper function to format time
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Clean up inactive sessions every hour
setInterval(() => {
    const now = Date.now();
    userSessions.forEach((session, userId) => {
        if (now - session.lastReward > 3600000) {
            userSessions.delete(userId);
        }
    });
}, 3600000);

// Export the router
module.exports = {
    router,
    userSessions
}; 