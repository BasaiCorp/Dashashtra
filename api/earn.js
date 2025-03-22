const express = require('express');
const router = express.Router();
const db = require('../db.js');
const chalk = require('chalk');
const fs = require('fs');
const userCoins = require('./user_coins.js');

// Simple logging function for debugging
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${message}`);
    
    // Optionally write to a log file
    try {
        if (!fs.existsSync('./logs')) {
            fs.mkdirSync('./logs');
        }
        fs.appendFileSync('./logs/afk.log', `${timestamp} ${message}\n`);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
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
        
        // Get or initialize user session data
        let userSession = userSessions.get(userId);
        if (!userSession) {
            userSession = { 
                lastReward: 0, 
                timeActive: 0, 
                totalEarned: 0,
                lastActivity: Date.now()
            };
            userSessions.set(userId, userSession);
        }
        
        const renderData = await getRenderData(req, {
            propellerAdsZoneId: process.env.PROPELLER_ADS_ZONE_ID || '',
            userCoinsBalance: userCoinsBalance,
            afkStats: {
                timeActive: userSession.timeActive || 0,
                totalEarned: userSession.totalEarned || 0,
                lastReward: userSession.lastReward || 0
            }
        });
        
        res.render('default/afk', renderData);
    } catch (error) {
        console.error(chalk.red('[AFK] Error rendering AFK page:'), error);
        res.status(500).send('An error occurred while loading the AFK page');
    }
});

// Get AFK stats
router.get('/api/earn/afk/stats', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        
        // Get user session
        let userSession = userSessions.get(userId);
        if (!userSession) {
            userSession = { 
                lastReward: 0, 
                timeActive: 0, 
                totalEarned: 0,
                lastActivity: Date.now(),
                sessionsToday: 1
            };
            userSessions.set(userId, userSession);
        }
        
        // Get user balance
        let balance = 0;
        try {
            balance = await userCoins.getUserCoins(userId);
        } catch (error) {
            console.error('Error getting user balance:', error);
        }
        
        res.json({ 
            success: true, 
            stats: userSession,
            balance: balance
        });
    } catch (error) {
        console.error(chalk.red('[EARN] Error getting AFK stats:'), error);
        log(`[AFK] Error getting stats: ${error.message}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update AFK activity (ping to keep session alive)
router.post('/api/earn/afk/ping', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        const now = Date.now();
        
        // Get or initialize user session
        let userSession = userSessions.get(userId);
        if (!userSession) {
            log(`[AFK] Creating new session for user ${userId}`);
            userSession = { 
                lastReward: 0, 
                timeActive: 0, 
                totalEarned: 0,
                lastActivity: now,
                sessionsToday: 1
            };
        }
        
        // Update last activity timestamp
        userSession.lastActivity = now;
        userSessions.set(userId, userSession);
        
        res.json({ success: true });
    } catch (error) {
        console.error(chalk.red('[EARN] Error processing AFK ping:'), error);
        log(`[AFK] Error processing ping: ${error.message}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API Routes - Update these routes to match the client JavaScript
router.post('/api/earn/afk', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        const now = Date.now();
        
        // Get or initialize user session
        let userSession = userSessions.get(userId);
        if (!userSession) {
            userSession = { 
                lastReward: 0, 
                timeActive: 0, 
                totalEarned: 0,
                lastActivity: now 
            };
        }
        
        // Check if 5 minutes have passed since last reward
        const timeElapsed = now - userSession.lastReward;
        if (timeElapsed < 300000) {
            return res.status(429).json({ 
                success: false, 
                error: 'Please wait before claiming another reward',
                timeRemaining: 300000 - timeElapsed
            });
        }
        
        // Load settings
        const settings = JSON.parse(fs.readFileSync('./settings.json'));
        
        // Get reward amount from settings or default to 15
        const afkSettings = settings.api?.client?.earn?.["afk page"] || { coins: 15 };
        const credits = afkSettings.coins || 15;
        
        // Update user's credits using only the user_coins module
        let currentBalance;
        try {
            currentBalance = await userCoins.getUserCoins(userId);
            log(`[AFK] Current balance for user ${userId}: ${currentBalance}`);
        } catch (error) {
            log(`[AFK] Error getting current balance: ${error.message}`);
            currentBalance = 0;
        }
        
        let newBalance;
        try {
            newBalance = await userCoins.addCoins(userId, credits);
            log(`[AFK] New balance after adding ${credits} credits: ${newBalance}`);
        } catch (error) {
            log(`[AFK] Error adding coins: ${error.message}`);
            // Fall back to current balance if there was an error
            newBalance = currentBalance;
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to add coins. Please try again.'
            });
        }
        
        // Update session data
        userSession.lastReward = now;
        userSession.timeActive = (userSession.timeActive || 0) + 300; // Add 5 minutes
        userSession.totalEarned = (userSession.totalEarned || 0) + credits;
        userSession.lastActivity = now;
        userSessions.set(userId, userSession);
        
        // Update user session with new balance to ensure it's available in templates
        if (!req.session.userinfo.coins) {
            req.session.userinfo.coins = newBalance;
        } else {
            req.session.userinfo.coins = newBalance;
        }
        
        // Save session to ensure changes persist
        req.session.save(err => {
            if (err) {
                log(`[AFK] Error saving session: ${err.message}`);
                console.error('Error saving session:', err);
            } else {
                log(`[AFK] Session saved successfully with new balance: ${newBalance}`);
            }
        });
        
        // Log the transaction
        console.log(chalk.green(`[EARN] User ${userId} earned ${credits} credits from AFK. New balance: ${newBalance}`));
        log(`[AFK] User ${userId} earned ${credits} credits. New balance: ${newBalance}`);
        
        res.json({ 
            success: true, 
            credits, 
            balance: newBalance,
            stats: {
                timeActive: userSession.timeActive,
                totalEarned: userSession.totalEarned
            }
        });
    } catch (error) {
        console.error(chalk.red('[EARN] Error processing AFK reward:'), error);
        log(`[AFK] Error processing reward: ${error.message}`);
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

// Get leaderboard data
router.get('/api/earn/leaderboard', async (req, res) => {
    try {
        const leaderboard = Array.from(userSessions.entries())
            .map(([userId, session]) => ({
                userId,
                timeActive: session.timeActive || 0,
                totalEarned: session.totalEarned || 0
            }))
            .sort((a, b) => b.timeActive - a.timeActive)
            .slice(0, 10);
        
        // Since db.get is not available, we'll use session data or mockup data
        const users = await Promise.all(leaderboard.map(async (entry) => {
            // Try to get username from database
            let username = 'User_' + entry.userId.substring(0, 6);
            try {
                const user = await db.users.getUserById(entry.userId);
                if (user && user.username) {
                    username = user.username;
                }
            } catch (error) {
                console.error(`Error fetching username for user ${entry.userId}:`, error);
            }
            
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
                credits: userCoinsAmount,
                totalEarned: entry.totalEarned || 0
            };
        }));
        
        res.json({ success: true, users });
    } catch (error) {
        console.error(chalk.red('[EARN] Error fetching leaderboard:'), error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Format time in hours, minutes, seconds
function formatTime(seconds) {
    if (!seconds) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Clean up old sessions periodically
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Remove sessions that haven't been active for more than 24 hours
    for (const [userId, session] of userSessions.entries()) {
        if (now - session.lastActivity > 24 * 60 * 60 * 1000) {
            userSessions.delete(userId);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        log(`[AFK] Cleaned up ${cleanedCount} inactive AFK sessions`);
    }
}, 60 * 60 * 1000); // Run every hour

module.exports = {
    router,
    // Export formatTime for use in other modules if needed
    formatTime
};