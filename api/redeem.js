const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const ejs = require("ejs");
const adminjs = require("./admin.js");
const db = require('../db.js');
const crypto = require('crypto');

// Helper function to convert hex to decimal
function hexToDecimal(hex) {
    return parseInt(hex.replace("#", ""), 16);
}

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (!req.session.userinfo || !req.session.userinfo.pterodactyl_root_admin) {
        return res.status(403).json({ success: false, message: 'Unauthorized. Admin access required.' });
    }
    next();
};

// Middleware to check if user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session.userinfo) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// Generate a random code
function generateRedeemCode() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Create a new redeem code (admin only)
router.post('/create', requireAdmin, async (req, res) => {
    try {
        const { credits_amount, max_uses, expires_at } = req.body;
        
        // Validate input
        if (!credits_amount || !max_uses || credits_amount <= 0 || max_uses <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Credits amount and max uses must be positive numbers.'
            });
        }

        // Generate a unique code
        let code = generateRedeemCode();
        while (await db.redeemCodes.getRedeemCode(code)) {
            code = generateRedeemCode();
        }

        // Create the redeem code
        await db.redeemCodes.createRedeemCode({
            code,
            credits_amount,
            max_uses,
            expires_at: expires_at || null,
            created_by: req.session.userinfo.id
        });

        res.json({
            success: true,
            message: 'Redeem code created successfully',
            code
        });
    } catch (error) {
        console.error('Error creating redeem code:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating the redeem code'
        });
    }
});

// Get all redeem codes (admin only)
router.get('/list', requireAdmin, async (req, res) => {
    try {
        const codes = await db.redeemCodes.getAllRedeemCodes();
        res.json({
            success: true,
            codes
        });
    } catch (error) {
        console.error('Error getting redeem codes:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while getting redeem codes'
        });
    }
});

// Delete a redeem code (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.redeemCodes.deleteRedeemCode(id);
        res.json({
            success: true,
            message: 'Redeem code deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting redeem code:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while deleting the redeem code'
        });
    }
});

// Redeem a code (user)
router.post('/redeem', requireAuth, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.session.userinfo.id;

        // Get the redeem code
        const redeemCode = await db.redeemCodes.getRedeemCode(code);
        if (!redeemCode) {
            return res.status(404).json({
                success: false,
                message: 'Invalid redeem code'
            });
        }

        // Check if code has expired
        if (redeemCode.expires_at && new Date(redeemCode.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'This redeem code has expired'
            });
        }

        // Check if code has reached max uses
        if (redeemCode.uses_count >= redeemCode.max_uses) {
            return res.status(400).json({
                success: false,
                message: 'This redeem code has reached its maximum uses'
            });
        }

        // Check if user has already used this code
        if (await db.redeemCodes.hasUserUsedCode(redeemCode.id, userId)) {
            return res.status(400).json({
                success: false,
                message: 'You have already used this redeem code'
            });
        }

        // Record the code use
        await db.redeemCodes.incrementCodeUses(redeemCode.id);
        await db.redeemCodes.recordCodeUse(redeemCode.id, userId);

        // Add credits to user's balance
        await db.coins.updateUserCoins(userId, redeemCode.credits_amount);
        const newBalance = await db.coins.getUserCoins(userId);

        res.json({
            success: true,
            message: `Successfully redeemed ${redeemCode.credits_amount} credits!`,
            newBalance
        });
    } catch (error) {
        console.error('Error redeeming code:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while redeeming the code'
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
