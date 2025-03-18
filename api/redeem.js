const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const ejs = require("ejs");
const adminjs = require("./admin.js");

// Helper function to convert hex to decimal
function hexToDecimal(hex) {
    return parseInt(hex.replace("#", ""), 16);
}

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
