const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const ejs = require("ejs");
const adminjs = require("./admin.js");
const db = require("../db.js");

// Helper function to check if store is enabled
async function enabledCheck(req, res) {
    let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());
    if (newsettings.api.client.coins.store.enabled == true) return newsettings;
    let theme = indexjs.get(req);
    res.redirect(theme.settings.redirect.storedisabled || "/");
    return null;
}

// Buy RAM route
router.get("/buyram", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let newsettings = await enabledCheck(req, res);
    if (!newsettings) return;

    let amount = req.query.amount;
    if (!amount) return res.send("Missing amount");

    amount = parseFloat(amount);
    if (isNaN(amount)) return res.send("Amount is not a number");
    if (amount < 1) return res.send("Amount must be at least 1");

    let theme = indexjs.get(req);

    let usercoins = await db.get("coins-" + req.session.userinfo.id) || 0;
    let per = newsettings.api.client.coins.store.ram.per;
    let cost = per * amount;

    if (usercoins < cost) return res.redirect(theme.settings.redirect.insufficientcoins || "/");

    let extra = await db.get("extra-" + req.session.userinfo.id) || {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
    };

    extra.ram = extra.ram + amount;
    usercoins = usercoins - cost;

    if (usercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
    } else {
        await db.set("coins-" + req.session.userinfo.id, usercoins);
    }

    await db.set("extra-" + req.session.userinfo.id, extra);

    res.redirect(theme.settings.redirect.purchasecompleteram || "/");
});

// Buy Disk route
router.get("/buydisk", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let newsettings = await enabledCheck(req, res);
    if (!newsettings) return;

    let amount = req.query.amount;
    if (!amount) return res.send("Missing amount");

    amount = parseFloat(amount);
    if (isNaN(amount)) return res.send("Amount is not a number");
    if (amount < 1) return res.send("Amount must be at least 1");

    let theme = indexjs.get(req);

    let usercoins = await db.get("coins-" + req.session.userinfo.id) || 0;
    let per = newsettings.api.client.coins.store.disk.per;
    let cost = per * amount;

    if (usercoins < cost) return res.redirect(theme.settings.redirect.insufficientcoins || "/");

    let extra = await db.get("extra-" + req.session.userinfo.id) || {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
    };

    extra.disk = extra.disk + amount;
    usercoins = usercoins - cost;

    if (usercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
    } else {
        await db.set("coins-" + req.session.userinfo.id, usercoins);
    }

    await db.set("extra-" + req.session.userinfo.id, extra);

    res.redirect(theme.settings.redirect.purchasecompletedisk || "/");
});

// Buy CPU route
router.get("/buycpu", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let newsettings = await enabledCheck(req, res);
    if (!newsettings) return;

    let amount = req.query.amount;
    if (!amount) return res.send("Missing amount");

    amount = parseFloat(amount);
    if (isNaN(amount)) return res.send("Amount is not a number");
    if (amount < 1) return res.send("Amount must be at least 1");

    let theme = indexjs.get(req);

    let usercoins = await db.get("coins-" + req.session.userinfo.id) || 0;
    let per = newsettings.api.client.coins.store.cpu.per;
    let cost = per * amount;

    if (usercoins < cost) return res.redirect(theme.settings.redirect.insufficientcoins || "/");

    let extra = await db.get("extra-" + req.session.userinfo.id) || {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
    };

    extra.cpu = extra.cpu + amount;
    usercoins = usercoins - cost;

    if (usercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
    } else {
        await db.set("coins-" + req.session.userinfo.id, usercoins);
    }

    await db.set("extra-" + req.session.userinfo.id, extra);

    res.redirect(theme.settings.redirect.purchasecompletecpu || "/");
});

// Buy Servers route
router.get("/buyservers", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let newsettings = await enabledCheck(req, res);
    if (!newsettings) return;

    let amount = req.query.amount;
    if (!amount) return res.send("Missing amount");

    amount = parseFloat(amount);
    if (isNaN(amount)) return res.send("Amount is not a number");
    if (amount < 1) return res.send("Amount must be at least 1");

    let theme = indexjs.get(req);

    let usercoins = await db.get("coins-" + req.session.userinfo.id) || 0;
    let per = newsettings.api.client.coins.store.servers.per;
    let cost = per * amount;

    if (usercoins < cost) return res.redirect(theme.settings.redirect.insufficientcoins || "/");

    let extra = await db.get("extra-" + req.session.userinfo.id) || {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
    };

    extra.servers = extra.servers + amount;
    usercoins = usercoins - cost;

    if (usercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
    } else {
        await db.set("coins-" + req.session.userinfo.id, usercoins);
    }

    await db.set("extra-" + req.session.userinfo.id, extra);

    res.redirect(theme.settings.redirect.purchasecompleteservers || "/");
});

// Export the router
module.exports = {
    router: router
};