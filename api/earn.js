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
router.get('/api/earn/stats', checkAuth, async (req, res) => {
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
            data: {
                timeActive: userSession.timeActive || 0,
                totalEarned: userSession.totalEarned || 0,
                sessionsToday: userSession.sessionsToday || 1,
                currentBalance: balance
            }
        });
    } catch (error) {
        console.error(chalk.red('[EARN] Error getting AFK stats:'), error);
        log(`[AFK] Error getting stats: ${error.message}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update AFK activity (ping to keep session alive)
router.post('/api/earn/ping', checkAuth, async (req, res) => {
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

// Handle AFK reward claim
router.post('/api/earn/afk', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        log(`[AFK] User ${userId} attempting to claim AFK reward`);
        
        // Get or initialize user session
        let userSession = userSessions.get(userId);
        if (!userSession) {
            log(`[AFK] Creating new session for user ${userId}`);
            userSession = { 
                lastReward: 0, 
                timeActive: 0, 
                totalEarned: 0,
                lastActivity: Date.now(),
                sessionsToday: 1
            };
            userSessions.set(userId, userSession);
        }
        
        const now = Date.now();
        
        // Time check is disabled in development for testing
        // In production, uncomment these checks
        /*
        // Check if enough time has passed since last reward (1 minute = 60,000 ms) 
        const timeSinceLastReward = now - userSession.lastReward;
        log(`[AFK] Time since last reward for user ${userId}: ${timeSinceLastReward}ms`);
        
        if (timeSinceLastReward < 60000) {
            log(`[AFK] User ${userId} attempted to claim reward too soon. Time remaining: ${60000 - timeSinceLastReward}ms`);
            return res.status(400).json({ 
                success: false, 
                error: 'You need to wait 1 minute between rewards', 
                timeRemaining: 60000 - timeSinceLastReward 
            });
        }
        
        // Check if user has been active in the last minute
        const timeSinceLastActivity = now - userSession.lastActivity;
        log(`[AFK] Time since last activity for user ${userId}: ${timeSinceLastActivity}ms`);
        
        if (timeSinceLastActivity > 60000) {
            log(`[AFK] User ${userId} session expired. Last activity: ${new Date(userSession.lastActivity).toISOString()}`);
            return res.status(400).json({ 
                success: false, 
                error: 'Your session has expired. Please refresh the page.' 
            });
        }
        */
        
        // Calculate reward - fixed 2 credits per AFK session
        const credits = 2; 
        log(`[AFK] User ${userId} earned ${credits} credits`);
        
        // Update user session
        userSession.lastReward = now;
        userSession.timeActive += 1 * 60; // Add 1 minute to active time
        userSession.totalEarned += credits;
        userSessions.set(userId, userSession);
        
        // Get current balance
        let currentBalance = await userCoins.getUserCoins(userId);
        log(`[AFK] User ${userId} current balance: ${currentBalance}`);
        
        // Add credits to user account
        try {
            // First save the previous balance in memory in case transaction fails
            const previousBalance = currentBalance;
            
            // Use userCoins to add credits (which now handles persistence correctly)
            await userCoins.addCoins(userId, credits);
            log(`[AFK] Added ${credits} credits to user ${userId}`);
            
            // Get updated balance
            const newBalance = await userCoins.getUserCoins(userId);
            log(`[AFK] User ${userId} new balance: ${newBalance}`);
            
            // Ensure the coins are actually added
            if (newBalance <= previousBalance) {
                log(`[AFK] Warning: Balance didn't increase after adding coins. Previous: ${previousBalance}, New: ${newBalance}`);
                // Try to force save
                await userCoins.setCoins(userId, previousBalance + credits);
                log(`[AFK] Forced balance update to ${previousBalance + credits}`);
            }
            
            // Return success response with the confirmed balance
            const confirmedBalance = await userCoins.getUserCoins(userId);
            
            return res.json({ 
                success: true, 
                credits: credits, 
                balance: confirmedBalance,
                totalEarned: userSession.totalEarned,
                timeActive: userSession.timeActive,
                remainingAfk: Math.max(0, 20 - (userSession.sessionsToday || 0)),
                timeUntilNextAfk: 0 // They just claimed, so it's 0
            });
        } catch (error) {
            console.error(chalk.red(`[AFK] Error adding credits to user ${userId}:`), error);
            log(`[AFK] Error adding credits: ${error.message}`);
            return res.status(500).json({ success: false, error: 'Failed to add credits to your account' });
        }
    } catch (error) {
        console.error(chalk.red('[AFK] Error processing reward claim:'), error);
        log(`[AFK] Error processing claim: ${error.message}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// New API endpoint for claim that uses the existing 'afk' endpoint implementation
// This ensures backward compatibility while providing the frontend with the expected endpoint
router.post('/api/earn/claim', checkAuth, async (req, res) => {
    try {
        const userId = req.session.userinfo.id;
        log(`[AFK] User ${userId} attempting to claim reward via new endpoint`);
        
        // Get or initialize user session
        let userSession = userSessions.get(userId);
        if (!userSession) {
            log(`[AFK] Creating new session for user ${userId}`);
            userSession = { 
                lastReward: 0, 
                timeActive: 0, 
                totalEarned: 0,
                lastActivity: Date.now(),
                sessionsToday: 1
            };
            userSessions.set(userId, userSession);
        }
        
        const now = Date.now();
        
        // Check if enough time has passed since last reward (5 minutes = 300,000 ms)
        const timeSinceLastReward = now - userSession.lastReward;
        log(`[AFK] Time since last reward for user ${userId}: ${timeSinceLastReward}ms`);
        
        if (timeSinceLastReward < 300000) {
            log(`[AFK] User ${userId} attempted to claim reward too soon. Time remaining: ${300000 - timeSinceLastReward}ms`);
            return res.status(400).json({ 
                success: false, 
                error: 'You need to wait 5 minutes between rewards', 
                timeRemaining: 300000 - timeSinceLastReward 
            });
        }
        
        // Check if user has been active in the last minute
        const timeSinceLastActivity = now - userSession.lastActivity;
        log(`[AFK] Time since last activity for user ${userId}: ${timeSinceLastActivity}ms`);
        
        if (timeSinceLastActivity > 60000) {
            log(`[AFK] User ${userId} session expired. Last activity: ${new Date(userSession.lastActivity).toISOString()}`);
            return res.status(400).json({ 
                success: false, 
                error: 'Your session has expired. Please refresh the page.' 
            });
        }
        
        // Calculate reward between 15-25 credits
        const credits = 2; // Fixed 2 credits per AFK session
        log(`[AFK] User ${userId} earned ${credits} credits`);
        
        // Update user session
        userSession.lastReward = now;
        userSession.timeActive += 5 * 60; // Add 5 minutes to active time
        userSession.totalEarned += credits;
        userSessions.set(userId, userSession);
        
        // Add credits to user account
        let currentBalance = await userCoins.getUserCoins(userId);
        log(`[AFK] User ${userId} current balance: ${currentBalance}`);
        
        try {
            await userCoins.addCoins(userId, credits);
            log(`[AFK] Added ${credits} credits to user ${userId}`);
        } catch (error) {
            console.error(chalk.red(`[AFK] Error adding credits to user ${userId}:`), error);
            log(`[AFK] Error adding credits: ${error.message}`);
            return res.status(500).json({ success: false, error: 'Failed to add credits to your account' });
        }
        
        // Get updated balance
        let newBalance = await userCoins.getUserCoins(userId);
        log(`[AFK] User ${userId} new balance: ${newBalance}`);
        
        // Return success response with renamed fields to match client expectations
        return res.json({ 
            success: true, 
            amount: credits, // renamed from 'credits' to 'amount' to match client-side expectations
            balance: newBalance,
            totalEarned: userSession.totalEarned,
            timeActive: userSession.timeActive
        });
    } catch (error) {
        console.error(chalk.red('[AFK] Error processing reward claim:'), error);
        log(`[AFK] Error processing claim: ${error.message}`);
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
        log(`[EARN] User ${userId} requesting balance`);
        
        // Get the balance from user_coins service
        let balance = await userCoins.getUserCoins(userId);
        
        // Force save to ensure persistence
        await userCoins.saveCoinsData();
        
        // Log the transaction
        log(`[EARN] User ${userId} balance check: ${balance}`);
        
        res.json({ 
            success: true, 
            balance,
            timestamp: Date.now()
        });
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

// Add compatibility route for /api/afk/start that redirects to /api/earn/afk
router.post('/api/afk/start', checkAuth, async (req, res) => {
    // Forward the request to the afk endpoint
    try {
        const userId = req.session.userinfo.id;
        log(`[AFK] User ${userId} attempting to claim AFK reward via /api/afk/start`);
        
        // Get or initialize user session
        let userSession = userSessions.get(userId);
        if (!userSession) {
            log(`[AFK] Creating new session for user ${userId}`);
            userSession = { 
                lastReward: 0, 
                timeActive: 0, 
                totalEarned: 0,
                lastActivity: Date.now(),
                sessionsToday: 1
            };
            userSessions.set(userId, userSession);
        }
        
        const now = Date.now();
        
        // No time check for now to ensure it works
        
        // Calculate reward - always 2 credits
        const credits = 2;
        log(`[AFK] User ${userId} earned ${credits} credits`);
        
        // Update user session
        userSession.lastReward = now;
        userSession.timeActive += 1 * 60; // Add 1 minute to active time
        userSession.totalEarned += credits;
        userSessions.set(userId, userSession);
        
        // Add credits to user account
        let currentBalance = await userCoins.getUserCoins(userId);
        log(`[AFK] User ${userId} current balance: ${currentBalance}`);
        
        try {
            await userCoins.addCoins(userId, credits);
            log(`[AFK] Added ${credits} credits to user ${userId}`);
        } catch (error) {
            console.error(chalk.red(`[AFK] Error adding credits to user ${userId}:`), error);
            log(`[AFK] Error adding credits: ${error.message}`);
            return res.status(500).json({ success: false, error: 'Failed to add credits to your account' });
        }
        
        // Get updated balance
        let newBalance = await userCoins.getUserCoins(userId);
        log(`[AFK] User ${userId} new balance: ${newBalance}`);
        
        // Return success response
        return res.json({ 
            success: true, 
            coins: newBalance,
            credits: credits,
            balance: newBalance,
            totalEarned: userSession.totalEarned,
            timeActive: userSession.timeActive,
            remainingAfk: Math.max(0, 20 - (userSession.sessionsToday || 0)),
            timeUntilNextAfk: 0
        });
    } catch (error) {
        console.error(chalk.red('[AFK] Error processing reward claim via /api/afk/start:'), error);
        log(`[AFK] Error processing claim: ${error.message}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = {
    router,
    formatTime
};