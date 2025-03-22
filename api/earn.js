const express = require('express');
const router = express.Router();
const db = require('../db.js');
const chalk = require('chalk');
const fs = require('fs');
const userCoins = require('./user_coins.js');

// Create a logging function
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage);
    
    // Append to log file
    fs.appendFileSync('./logs/latest.log', logMessage, { flag: 'a+' });
}

// Store user sessions and their last reward times
const userSessions = new Map();

// Middleware to check if user is logged in
function checkAuth(req, res, next) {
    log(`[checkAuth] Checking auth - Session exists: ${!!req.session}`);
    
    if (!req.session.userinfo || !req.session.pterodactyl) {
        log(`[checkAuth] Authentication failed - missing userinfo: ${!req.session.userinfo}, missing pterodactyl: ${!req.session.pterodactyl}`);
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    log(`[checkAuth] Authentication successful for user ID: ${req.session.userinfo.id}`);
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
        const userId = req.session.userinfo.id;
        const userCoinsBalance = await userCoins.getUserCoins(userId);
        
        const renderData = await getRenderData(req, {
            propellerAdsZoneId: process.env.PROPELLER_ADS_ZONE_ID || '',
            userCoinsBalance: userCoinsBalance
        });
        
        res.render('default/afk', renderData);
    } catch (error) {
        console.error(chalk.red('[AFK] Error rendering AFK page:'), error);
        res.status(500).send('An error occurred while loading the AFK page');
    }
});

// API Routes - Update these routes to match the client JavaScript
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
        
        // Calculate credits (15 credits per 5 minutes = 75 credits per hour)
        const credits = 15;
        
        // Update user's credits using only the user_coins module
        const newBalance = await userCoins.addCoins(userId, credits);
        
        // Update session data
        userSession.lastReward = now;
        userSession.timeActive = (userSession.timeActive || 0) + 300;
        userSessions.set(userId, userSession);
        
        // Update user session with new balance to ensure it's available in templates
        if (!req.session.userinfo.coins) {
            req.session.userinfo.coins = newBalance;
        } else {
            req.session.userinfo.coins = newBalance;
        }
        
        // Save session to ensure changes persist
        req.session.save(err => {
            if (err) console.error('Error saving session:', err);
        });
        
        // Log the transaction
        console.log(chalk.green(`[EARN] User ${userId} earned ${credits} credits from AFK. New balance: ${newBalance}`));
        res.json({ success: true, credits, balance: newBalance });
    } catch (error) {
        console.error(chalk.red('[EARN] Error processing AFK reward:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// CLAIM DAILY REWARD ENDPOINT
router.post('/daily', checkAuth, async (req, res) => {
    try {
        log(`Daily reward claim attempt - Session: ${JSON.stringify(req.session)}`);
        
        if (!req.session.userinfo || !req.session.pterodactyl) {
            log('Daily reward - User not logged in');
            return res.status(401).json({ success: false, error: 'Not logged in' });
        }

        const userId = req.session.userinfo.id;
        log(`Daily reward - User ID: ${userId}`);

        // Check if user has already claimed today
        const lastDailyReward = req.session.lastDailyReward || 0;
        const now = Date.now();
        
        log(`Daily reward - Last claim: ${new Date(lastDailyReward).toISOString()}, Now: ${new Date(now).toISOString()}`);
        
        // Check if 24 hours have passed since last reward
        const timeElapsed = now - lastDailyReward;
        const hoursElapsed = timeElapsed / (1000 * 60 * 60);
        log(`Daily reward - Time elapsed: ${timeElapsed}ms (${hoursElapsed.toFixed(2)} hours)`);
        
        if (timeElapsed < 24 * 60 * 60 * 1000) {
            const timeRemaining = 24 * 60 * 60 * 1000 - timeElapsed;
            log(`Daily reward - Time remaining: ${timeRemaining}ms (${(timeRemaining/(1000*60*60)).toFixed(2)} hours)`);
            
            return res.json({
                success: false, 
                error: 'You can only claim one daily reward every 24 hours',
                timeRemaining: timeRemaining
            });
        }

        // Calculate reward (random between 10-100 coins)
        const rewardAmount = Math.floor(Math.random() * 91) + 10;
        log(`Daily reward - Reward amount: ${rewardAmount}`);

        // Add coins to user's balance
        let currentBalance = await userCoins.getUserCoins(userId);
        log(`Daily reward - Current balance: ${currentBalance}`);
        
        await userCoins.addCoins(userId, rewardAmount);
        
        let newBalance = await userCoins.getUserCoins(userId);
        log(`Daily reward - New balance: ${newBalance}`);

        // Update session to mark daily reward as claimed
        req.session.lastDailyReward = now;
        
        // Save the session to ensure updates persist
        log(`Daily reward - Saving session: ${JSON.stringify(req.session)}`);
        req.session.save(err => {
            if (err) {
                log(`Daily reward - Session save error: ${err.message}`);
            } else {
                log('Daily reward - Session saved successfully');
            }
        });

        log(`Daily reward - Successfully claimed ${rewardAmount} coins`);
        
        return res.json({
            success: true,
            credits: rewardAmount,
            balance: newBalance,
            message: `You earned ${rewardAmount} coins! Come back tomorrow for more!`
        });
    } catch (error) {
        log(`Daily reward - Error: ${error.message}`);
        console.error('Error claiming daily reward:', error);
        return res.status(500).json({ success: false, error: 'Server error' });
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
        
        // Since db.get is not available, we'll use session data or mockup data
        const users = await Promise.all(leaderboard.map(async (entry) => {
            // Use userinfo from session if available, or provide placeholder data
            let username = 'User_' + entry.userId;
            // Get coins from userCoins module instead of using db.get
            let userCoinsAmount = 0;
            try {
                userCoinsAmount = await userCoins.getUserCoins(entry.userId);
            } catch (e) {
                console.error('Error fetching coins for leaderboard:', e);
            }
            
            return {
                username: username,
                timeActive: formatTime(entry.timeActive),
                credits: userCoinsAmount
            };
        }));
        
        res.json({ success: true, users });
    } catch (error) {
        console.error(chalk.red('[EARN] Error fetching leaderboard:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get user's coin balance
router.get('/api/earn/balance', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        const balance = await userCoins.getUserCoins(userId);
        
        res.json({ success: true, balance });
    } catch (error) {
        console.error(chalk.red('[EARN] Error fetching user balance:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Check if daily reward is available
router.get('/api/earn/daily/status', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        const lastDaily = req.session.lastDailyReward || 0;
        const now = Date.now();
        const timeRemaining = 86400000 - (now - lastDaily);
        
        if (timeRemaining > 0) {
            res.json({ 
                success: true, 
                available: false, 
                timeRemaining: timeRemaining
            });
        } else {
            res.json({ 
                success: true, 
                available: true
            });
        }
    } catch (error) {
        console.error(chalk.red('[EARN] Error checking daily reward status:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get user's referral count
router.get('/api/earn/referrals', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        // Since we don't have DB access, use session for now
        const referrals = req.session.referrals || 0;
        
        res.json({ 
            success: true, 
            referrals: referrals
        });
    } catch (error) {
        console.error(chalk.red('[EARN] Error fetching referral count:'), error);
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