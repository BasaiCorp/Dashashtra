const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const ejs = require("ejs");

// Helper function to generate random password
function makeid(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// Panel redirect route
router.get("/panel", async (req, res) => {
    res.redirect(settings.pterodactyl.domain);
});

// Password regeneration route
router.get("/regen", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    
    let newsettings = JSON.parse(fs.readFileSync("./settings.json"));
    if (newsettings.api.client.allow.regen !== true) {
        return res.send("You cannot regenerate your password currently.");
    }

    let newpassword = makeid(newsettings.api.client.passwordgenerator.length);
    
    if (newsettings.api.client.passwordgenerator.signup == true) {
        if (newsettings.api.client.passwordgenerator.dictionary == true) {
            newpassword = makeid(newsettings.api.client.passwordgenerator["length"]);
        }
    }

    let userinfo = req.session.pterodactyl;
    
    await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${userinfo.id}`,
        {
            method: "PATCH",
            headers: {
                'Content-Type': 'application/json',
                "Authorization": `Bearer ${settings.pterodactyl.key}`
            },
            body: JSON.stringify({
                username: userinfo.username,
                email: userinfo.email,
                first_name: userinfo.first_name,
                last_name: userinfo.last_name,
                password: newpassword
            })
        }
    );

    let theme = indexjs.get(req);
    res.redirect(theme.settings.redirect.regenpassword ?? "/");
});

// Export the router
module.exports = {
    router: router
};