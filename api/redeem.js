const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs').promises;
const ejs = require("ejs");
const adminjs = require("./admin.js");
const db = require('../db.js');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require('path');
const fsSync = require('fs'); // For synchronous operations if needed
const userCoins = require('./user_coins.js'); // Import the user_coins module

// Helper function to convert hex to decimal
function hexToDecimal(hex) {
    return parseInt(hex.replace("#", ""), 16);
}

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
    try {
        console.log(chalk.blue(`[REDEEM] Admin check for user ${req.session?.pterodactyl?.id}`));
        
        // First check if user is already marked as admin in session
        if (req.session && req.session.isAdmin) {
            return next();
        }

        if (!req.session || !req.session.pterodactyl) {
            console.log(chalk.yellow('[REDEEM] Unauthorized access attempt - No session'));
            return res.status(401).json({
                success: false,
                message: 'You must be logged in to access this resource'
            });
        }

        // Check if user is admin in Pterodactyl
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/users/${req.session.pterodactyl.id}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch user: ${response.status} ${response.statusText}`);
        }

        const userData = await response.json();
        
        if (!userData.attributes.root_admin) {
            console.log(chalk.yellow(`[REDEEM] Unauthorized access attempt by user ${req.session.pterodactyl.id}`));
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this resource',
                error: 'Insufficient privileges'
            });
        }

        // Update session with latest user data
        req.session.pterodactyl = userData.attributes;
        req.session.isAdmin = true;
        next();
    } catch (error) {
        console.error(chalk.red('[REDEEM] Error checking admin status:'), error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while checking admin status',
            error: error.message
        });
    }
};

// Middleware to check if user is logged in
const requireAuth = (req, res, next) => {
    console.log(chalk.blue(`[REDEEM] Auth check for user ${req.session?.userinfo?.id}`));
    if (!req.session.userinfo) {
        console.log(chalk.red(`[REDEEM] Unauthorized access attempt from IP: ${req.ip}`));
        return res.status(401).json({ 
            success: false, 
            message: 'You must be logged in to access this resource',
            error: 'No session found'
        });
    }
    console.log(chalk.green(`[REDEEM] Auth granted for user ${req.session.userinfo.id}`));
    next();
};

// Generate a random code
function generateRedeemCode() {
    const code = crypto.randomBytes(8).toString('hex').toUpperCase();
    console.log(chalk.blue(`[REDEEM] Generated new code: ${code}`));
    return code;
}

// Create a new redeem code (admin only)
router.post('/create', requireAdmin, async (req, res) => {
    console.log(chalk.blue('[REDEEM] Creating new redeem code'));
    console.log(chalk.blue('[REDEEM] Request body:', req.body));
    
    try {
        const { credits_amount, max_uses, expires_at } = req.body;
        
        // Enhanced input validation
        const validationErrors = [];
        
        if (!credits_amount || isNaN(credits_amount) || credits_amount <= 0) {
            validationErrors.push('Credits amount must be a positive number');
        }
        
        if (!max_uses || isNaN(max_uses) || max_uses <= 0) {
            validationErrors.push('Maximum uses must be a positive number');
        }
        
        if (expires_at && new Date(expires_at) <= new Date()) {
            validationErrors.push('Expiration date must be in the future');
        }
        
        if (validationErrors.length > 0) {
            console.log(chalk.yellow('[REDEEM] Validation errors:', validationErrors));
            return res.status(400).json({
                success: false,
                message: 'Invalid input parameters',
                errors: validationErrors,
                details: {
                    credits_amount: credits_amount ? 'valid' : 'invalid/missing',
                    max_uses: max_uses ? 'valid' : 'invalid/missing',
                    expires_at: expires_at ? 'valid' : 'not provided'
                }
            });
        }

        // Generate a unique code
        let code = generateRedeemCode();
        let attempts = 0;
        const maxAttempts = 5;
        
        while (await db.redeemCodes.getRedeemCode(code)) {
            console.log(chalk.yellow(`[REDEEM] Code collision detected, regenerating... (Attempt ${attempts + 1}/${maxAttempts})`));
            if (attempts >= maxAttempts) {
                throw new Error('Failed to generate unique code after multiple attempts');
            }
            code = generateRedeemCode();
            attempts++;
        }

        // Create the redeem code
        const codeData = {
            code,
            credits_amount,
            max_uses,
            expires_at: expires_at || null,
            created_by: req.session.pterodactyl.id,
            created_at: new Date().toISOString()
        };

        console.log(chalk.blue(`[REDEEM] Creating code with parameters:`, codeData));

        const result = await db.redeemCodes.createRedeemCode(codeData);

        // Log the creation in settings webhook if enabled
        const settingsPath = path.join(process.cwd(), 'settings.json');
        let newsettings;
        try {
            const settingsData = await fs.readFile(settingsPath, 'utf8');
            newsettings = JSON.parse(settingsData);
            
            if (newsettings.api.client.webhook.auditlogs.enabled && 
                !newsettings.api.client.webhook.auditlogs.disabled.includes("REDEEMCODE_CREATE")) {
                let params = JSON.stringify({
                    embeds: [{
                        title: "Redeem Code Created",
                        description: `**Admin:** ${req.session.pterodactyl.username} (${req.session.pterodactyl.id})\n\n**Code Details:**\n- Credits: ${credits_amount}\n- Max Uses: ${max_uses}\n- Expires: ${expires_at || 'Never'}`,
                        color: hexToDecimal("#00ff00")
                    }]
                });
                
                await fetch(`${newsettings.api.client.webhook.webhook_url}`, {
                    method: "POST",
                    headers: {
                        'Content-type': 'application/json',
                    },
                    body: params
                }).catch(e => console.warn(chalk.red("[WEBSITE] There was an error sending to the webhook: " + e)));
            }
        } catch (settingsError) {
            console.warn(chalk.yellow("[REDEEM] Error reading settings or sending webhook:"), settingsError);
            // Continue execution even if webhook fails
        }

        console.log(chalk.green(`[REDEEM] Successfully created code: ${code}`));
        res.json({
            success: true,
            message: 'Redeem code created successfully',
            code,
            details: {
                ...codeData,
                expires_at: expires_at || 'No expiration'
            }
        });
    } catch (error) {
        console.error(chalk.red('[REDEEM] Error creating redeem code:'), error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating the redeem code',
            error: error.message
        });
    }
});

// Get all redeem codes (admin only)
router.get('/list', requireAdmin, async (req, res) => {
    console.log(chalk.blue('[REDEEM] Fetching all redeem codes'));
    try {
        const codes = await db.redeemCodes.getAllRedeemCodes();
        console.log(chalk.green(`[REDEEM] Successfully fetched ${codes.length} codes`));
        res.json({
            success: true,
            codes
        });
    } catch (error) {
        console.error(chalk.red('[REDEEM] Error getting redeem codes:'), error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while getting redeem codes',
            error: error.message
        });
    }
});

// Delete a redeem code (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    console.log(chalk.blue(`[REDEEM] Attempting to delete code with ID: ${id}`));
    
    try {
        // First check if code exists
        const code = await db.redeemCodes.getRedeemCodeById(id);
        if (!code) {
            console.log(chalk.yellow(`[REDEEM] Code with ID ${id} not found`));
            return res.status(404).json({
                success: false,
                message: 'Redeem code not found'
            });
        }

        await db.redeemCodes.deleteRedeemCode(id);
        console.log(chalk.green(`[REDEEM] Successfully deleted code with ID: ${id}`));
        
        res.json({
            success: true,
            message: 'Redeem code deleted successfully'
        });
    } catch (error) {
        console.error(chalk.red(`[REDEEM] Error deleting redeem code ${id}:`), error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while deleting the redeem code',
            error: error.message
        });
    }
});

// Redeem a code (user)
router.post('/redeem', requireAuth, async (req, res) => {
    console.log(chalk.blue('[REDEEM] Processing redeem request'));
    console.log(chalk.blue('[REDEEM] Request body:', req.body));
    
    try {
        const { code } = req.body;
        if (!code) {
            console.log(chalk.yellow('[REDEEM] No code provided'));
            return res.status(400).json({
                success: false,
                message: 'Please provide a redeem code'
            });
        }

        // Get internal user ID from pterodactyl ID
        const pterodactylId = req.session.pterodactyl.id;
        const user = await db.users.getUserByPterodactylId(pterodactylId);
        
        if (!user) {
            console.log(chalk.red(`[REDEEM] User not found for Pterodactyl ID: ${pterodactylId}`));
            return res.status(404).json({
                success: false,
                message: 'User not found in database'
            });
        }

        const userId = user.id;
        console.log(chalk.blue(`[REDEEM] User ${userId} attempting to redeem code: ${code}`));

        // Get the redeem code
        const redeemCode = await db.redeemCodes.getRedeemCode(code);
        if (!redeemCode) {
            console.log(chalk.yellow(`[REDEEM] Invalid code attempt: ${code}`));
            return res.status(404).json({
                success: false,
                message: 'Invalid redeem code'
            });
        }

        // Check if code has expired
        if (redeemCode.expires_at && new Date(redeemCode.expires_at) < new Date()) {
            console.log(chalk.yellow(`[REDEEM] Expired code attempt: ${code}`));
            return res.status(400).json({
                success: false,
                message: 'This redeem code has expired'
            });
        }

        // Check if code has reached max uses
        if (redeemCode.uses_count >= redeemCode.max_uses) {
            console.log(chalk.yellow(`[REDEEM] Max uses reached for code: ${code}`));
            return res.status(400).json({
                success: false,
                message: 'This redeem code has reached its maximum uses'
            });
        }

        // Check if user has already used this code
        if (await db.redeemCodes.hasUserUsedCode(redeemCode.id, userId)) {
            console.log(chalk.yellow(`[REDEEM] User ${userId} attempted to reuse code: ${code}`));
            return res.status(400).json({
                success: false,
                message: 'You have already used this redeem code'
            });
        }

        // Record the code use and increment counter
        await db.redeemCodes.recordCodeUse(redeemCode.id, userId);
        await db.redeemCodes.incrementCodeUses(redeemCode.id);

        // Get current balance using user_coins module
        let currentBalance = await userCoins.getUserCoins(userId) || 0;
        console.log(chalk.blue(`[REDEEM] Current balance for user ${userId}: ${currentBalance}`));
        
        // Add credits using user_coins module
        const creditsToAdd = parseInt(redeemCode.credits_amount) || 0;
        const newBalance = await userCoins.addCoins(userId, creditsToAdd);
        console.log(chalk.blue(`[REDEEM] Added ${creditsToAdd} credits. New balance: ${newBalance}`));

        console.log(chalk.green(`[REDEEM] Successfully redeemed code ${code} for user ${userId}. Credits: ${redeemCode.credits_amount}, New Balance: ${newBalance}`));

        res.json({
            success: true,
            message: `Successfully redeemed ${redeemCode.credits_amount} credits!`,
            newBalance,
            details: {
                credits_added: redeemCode.credits_amount,
                old_balance: currentBalance,
                new_balance: newBalance
            }
        });
    } catch (error) {
        console.error(chalk.red('[REDEEM] Error redeeming code:'), error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while redeeming the code',
            error: error.message
        });
    }
});

// Get user's recent redemptions
router.get('/history', requireAuth, async (req, res) => {
    try {
        // Get internal user ID from pterodactyl ID
        const pterodactylId = req.session.pterodactyl.id;
        const user = await db.users.getUserByPterodactylId(pterodactylId);
        
        if (!user) {
            console.log(chalk.red(`[REDEEM] User not found for Pterodactyl ID: ${pterodactylId}`));
            return res.status(404).json({
                success: false,
                message: 'User not found in database'
            });
        }

        const history = await db.redeemCodes.getUserRedemptionHistory(user.id);
        res.json({
            success: true,
            history
        });
    } catch (error) {
        console.error(chalk.red('[REDEEM] Error getting redemption history:'), error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while getting redemption history',
            error: error.message
        });
    }
});

// Coupon redemption route
router.get("/coupon_redeem", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let theme = indexjs.get(req);
    let code = req.query.code;

    if (!code) {
        return res.redirect(theme.settings.redirect.missingorinvalidcouponcode + "?err=MISSINGCOUPONCODE");
    }

    let couponinfo = await db.get("coupon-" + code);

    if (!couponinfo) {
        return res.redirect(theme.settings.redirect.missingorinvalidcouponcode + "?err=INVALIDCOUPONCODE");
    }

    let userinfo = req.session.pterodactyl;
    let coins = await db.get("coins-" + userinfo.id) || 0;
    let memory = await db.get("extra-" + userinfo.id) || { ram: 0, disk: 0, cpu: 0, servers: 0 };

    if (couponinfo.coins) {
        coins += couponinfo.coins;
        await db.set("coins-" + userinfo.id, coins);
    }

    if (couponinfo.memory) {
        memory.ram += couponinfo.memory;
        await db.set("extra-" + userinfo.id, memory);
    }

    if (couponinfo.disk) {
        memory.disk += couponinfo.disk;
        await db.set("extra-" + userinfo.id, memory);
    }

    if (couponinfo.cpu) {
        memory.cpu += couponinfo.cpu;
        await db.set("extra-" + userinfo.id, memory);
    }

    if (couponinfo.servers) {
        memory.servers += couponinfo.servers;
        await db.set("extra-" + userinfo.id, memory);
    }

    await db.delete("coupon-" + code);

    res.redirect(theme.settings.redirect.successfullyredeemedcoupon + "?err=SUCCESSCOUPONCODE");

    let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());

    if (newsettings.api.client.webhook.auditlogs.enabled && !newsettings.api.client.webhook.auditlogs.disabled.includes("COUPONREDEEM")) {
      let params = JSON.stringify({
        embeds: [
          {
            title: "Coupon Redeemed",
            description: `**__User:__** ${req.session.userinfo.username}#${req.session.userinfo.discriminator} (${req.session.userinfo.id})\n\n**Code**: ${code}`,
            color: hexToDecimal("#ffff00")
          }
        ]
      })
      fetch(`${newsettings.api.client.webhook.webhook_url}`, {
        method: "POST",
        headers: {
          'Content-type': 'application/json',
        },
        body: params
      }).catch(e => console.warn(chalk.red("[WEBSITE] There was an error sending to the webhook: " + e)));
    }
});

// Export the router
module.exports = {
    router: router
};
