const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const db = require("../db.js");

let renewalservers = {};

// Initialize renewal system if enabled
if (settings.api.client.allow.renewsuspendsystem.enabled == true) {
    // Renewal check interval
    setInterval(async () => {
        for (let [id, value] of Object.entries(renewalservers)) {
            renewalservers[id]--;
            if (renewalservers[id] < 1) {
                let canpass = await indexjs.islimited();
                if (canpass == false) {
                    renewalservers[id] = 0;
                    continue;
                }

                let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());
                if (newsettings.api.client.allow.renewsuspendsystem.enabled !== true) return;

                let userinfo = await db.get("user-" + id);
                let serverInfo = await db.get("server-" + id);
                
                if (!userinfo || !serverInfo) {
                    delete renewalservers[id];
                    return;
                }

                let panel = await fetch(
                    settings.pterodactyl.domain + "/api/application/servers/" + serverInfo.id + "/suspend",
                    {
                        method: "POST",
                        headers: {
                            'Content-Type': 'application/json',
                            "Authorization": `Bearer ${settings.pterodactyl.key}`
                        }
                    }
                );

                if (await panel.statusText !== "No Content") {
                    console.log("[RENEWAL] Failed to suspend server.");
                    return;
                }

                await db.set("server-" + id + ".suspended", true);
                delete renewalservers[id];
            }
        }
    }, 1000);
}

// Renewal routes
router.get("/renew", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    
    let theme = indexjs.get(req);

    if (!req.query.id) return res.send("Missing server ID.");

    let userinfo = req.session.pterodactyl;
    let serverInfo = await db.get("server-" + req.query.id);
    
    if (!serverInfo) return res.send("Invalid server ID.");
    if (serverInfo.owner !== userinfo.id) return res.send("Not server owner.");

    let coins = await db.get("coins-" + userinfo.id) || 0;
    let cost = settings.api.client.allow.renewsuspendsystem.cost;

    if (cost > coins) return res.redirect(theme.settings.redirect.insufficientcoins + "?err=INSUFFICIENTCOINS");

    coins = coins - cost;
    await db.set("coins-" + userinfo.id, coins);

    if (serverInfo.suspended == true) {
        let panel = await fetch(
            settings.pterodactyl.domain + "/api/application/servers/" + serverInfo.id + "/unsuspend",
            {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                    "Authorization": `Bearer ${settings.pterodactyl.key}`
                }
            }
        );

        if (await panel.statusText !== "No Content") return res.send("Failed to unsuspend server.");
        
        await db.set("server-" + req.query.id + ".suspended", false);
    }

    renewalservers[req.query.id] = settings.api.client.allow.renewsuspendsystem.time;

    res.redirect(theme.settings.redirect.renewserver || "/");
});

// Export the router
module.exports = {
    router: router
};

// Export renewalservers separately if needed
module.exports.renewalservers = renewalservers;