const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const ejs = require("ejs");
const db = require("../db.js");

// Root route handler
router.all("/", async (req, res) => {
    if (req.session.pterodactyl) {
        if (req.session.pterodactyl.id !== await db.get("users-" + req.session.userinfo.id)) {
            return res.redirect("/login?prompt=none");
        }
    }

    let theme = indexjs.get(req);
    
    // Check if user must be logged in for this route
    if (theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname)) {
        if (!req.session.userinfo || !req.session.pterodactyl) {
            return res.redirect("/login");
        }
    }

    // Check if user must be admin for this route
    if (theme.settings.mustbeadmin.includes(req._parsedUrl.pathname)) {
        if (!req.session.userinfo || !req.session.pterodactyl) {
            delete req.session.newaccount;
            return res.redirect("/login");
        }
        
        let cacheaccount = await fetch(
            settings.pterodactyl.domain + "/api/application/users/" + req.session.pterodactyl.id + "?include=servers",
            {
                method: "get",
                headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
            }
        );
        
        if (await cacheaccount.statusText == "Not Found") {
            delete req.session.newaccount;
            return res.redirect("/login");
        }
        
        let cacheaccountinfo = await cacheaccount.json();

        req.session.pterodactyl = cacheaccountinfo.attributes;
        
        if (theme.settings.api.client.oauth2.link.slice(-1) == "/")
            theme.settings.api.client.oauth2.link = theme.settings.api.client.oauth2.link.slice(0, -1);
        
        if (theme.settings.api.client.oauth2.callbackpath.slice(0, 1) !== "/")
            theme.settings.api.client.oauth2.callbackpath = "/" + theme.settings.api.client.oauth2.callbackpath;
        
        if (!theme.settings.api.client.oauth2.callbackpath.includes("index.js"))
            return res.send("Missing callback file for OAuth2 system. Please contact an administrator to fix this.");
        
        if (!theme.settings.api.client.oauth2.id)
            return res.send("Missing OAuth2 ID. Please contact an administrator to fix this.");
        
        if (!theme.settings.api.client.oauth2.secret)
            return res.send("Missing OAuth2 Secret. Please contact an administrator to fix this.");
        
        if (theme.settings.pterodactyl.domain.slice(-1) == "/")
            theme.settings.pterodactyl.domain = theme.settings.pterodactyl.domain.slice(0, -1);
        
        let packagename = await db.get("package-" + req.session.userinfo.id);
        let package = theme.settings.api.client.packages.list[packagename ? packagename : theme.settings.api.client.packages.default];
        
        if (!package) package = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };

        package["name"] = packagename;

        let pterodactylid = await db.get("users-" + req.session.userinfo.id);
        let userinforeq = await fetch(
            settings.pterodactyl.domain + "/api/application/users/" + pterodactylid + "?include=servers",
            {
                method: "get",
                headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
            }
        );

        if (await userinforeq.statusText == "Not Found") {
            console.log("[WEBSITE] An error has occurred while attempting to get a user's information");
            console.log("- Discord ID: " + req.session.userinfo.id);
            console.log("- Pterodactyl Panel ID: " + pterodactylid);
            return res.send("An error has occurred while attempting to get your user information.");
        }

        let userinfo = await userinforeq.json();

        let extra = await db.get("extra-" + req.session.userinfo.id);
        if (!extra) extra = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        }

        let coins = await db.get("coins-" + req.session.userinfo.id);
        coins = coins ? coins : 0;

        let renderdata = {
            req: req,
            settings: theme.settings,
            userinfo: userinfo,
            extra: extra,
            package: package,
            coins: coins
        };

        if (!req.session.pterodactyl.root_admin) {
            return res.redirect("/");
        }

        ejs.renderFile(
            `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)] ? theme.settings.pages[req._parsedUrl.pathname.slice(1)] : theme.settings.notfound}`, 
            renderdata,
            null,
            function (err, str) {
                if (err) {
                    console.log(`[WEBSITE] An error has occurred on path ${req._parsedUrl.pathname}:`);
                    console.log(err);
                    return res.send("An error has occurred while attempting to load this page. Please contact an administrator to fix this.");
                }
                res.send(str);
            }
        );
    } else {
        ejs.renderFile(
            `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)] ? theme.settings.pages[req._parsedUrl.pathname.slice(1)] : theme.settings.notfound}`, 
            await eval(indexjs.renderdataeval),
            null,
            function (err, str) {
                if (err) {
                    console.log(`[WEBSITE] An error has occurred on path ${req._parsedUrl.pathname}:`);
                    console.log(err);
                    return res.send("An error has occurred while attempting to load this page. Please contact an administrator to fix this.");
                }
                res.send(str);
            }
        );
    }
});

// Export the router
module.exports = {
    router: router
};