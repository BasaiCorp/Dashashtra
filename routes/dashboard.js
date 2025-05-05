const express = require('express');
const router = express.Router();
const fs = require('fs');
const ejs = require('ejs');
const chalk = require('chalk');
const fetch = require('node-fetch');
const path = require('path');
const db = require('../db.js');
const indexjs = require('../index.js');
const settings = require('../settings.json');

// Dashboard route
router.get('/', async (req, res) => {
    if (!req.session || !req.session.userinfo || !req.session.pterodactyl) {
        return res.redirect('/login');
    }
    
    try {
        console.log(chalk.blue('[DASHBOARD] Dashboard accessed by user', req.session.userinfo.id));
        
        // Get user's theme
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Get dashboard page from theme settings
        const dashboardPage = theme.settings.pages && theme.settings.pages.dashboard ? 
            theme.settings.pages.dashboard : 'dashboard.ejs';
        
        ejs.renderFile(
            `./themes/${theme.name}/${dashboardPage}`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[DASHBOARD] Error rendering dashboard page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the dashboard. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[DASHBOARD] Error in dashboard route:'), error);
        res.status(500).send("An error occurred while loading the dashboard. Please try again later.");
    }
});

module.exports = router; 