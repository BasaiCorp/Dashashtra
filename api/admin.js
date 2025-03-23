const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require("fs");
const indexjs = require("../index.js");
const ejs = require("ejs");
const chalk = require('chalk');
const db = require("../db.js");
const { getUsers, getUserById, updateUser } = require('./fetch_users');
const { getServers, getServerById, updateServerDetails, updateServerBuild, suspendServer, unsuspendServer, deleteServer } = require('./fetch_servers');
const { getNodes, getNodeById, getNodeAllocations } = require('./fetch_nodes');
const { getNests, getEggs, getNestById, getEggById, createNest, updateNest, deleteNest, createEgg, updateEgg, deleteEgg } = require('./fetch_eggs');
const axios = require('axios');
const path = require('path');

if (settings.pterodactyl) if (settings.pterodactyl.domain) {
    if (settings.pterodactyl.domain.slice(-1) == "/") settings.pterodactyl.domain = settings.pterodactyl.domain.slice(0, -1);
};

// Helper function for 404
async function four0four(req, res, theme) {
    ejs.renderFile(
        `./themes/${theme.name}/${theme.settings.notfound}`, 
        await eval(indexjs.renderdataeval),
        null,
    function (err, str) {
        delete req.session.newaccount;
        if (err) {
            console.log(`[WEBSITE] An error has occured on path ${req._parsedUrl.pathname}:`);
            console.log(err);
            return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
        };
        res.status(404);
        res.send(str);
    });
}

function hexToDecimal(hex) {
    return parseInt(hex.replace("#", ""), 16)
}

// Middleware to check if user is admin
async function checkAdmin(req, res, next) {
    try {
        // First check if user is already marked as admin in session
        if (req.session && req.session.isAdmin) {
            return next();
        }

        if (!req.session || !req.session.pterodactyl) {
            console.log(chalk.yellow('[ADMIN] Unauthorized access attempt - No session'));
            return res.redirect('/login');
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
            console.log(chalk.yellow(`[ADMIN] Unauthorized access attempt by user ${req.session.pterodactyl.id}`));
            return res.status(403).render('404', { 
                title: 'Access Denied',
                error: 'You do not have permission to access this page.'
            });
        }

        // Update session with latest user data
        req.session.pterodactyl = userData.attributes;
        req.session.isAdmin = true;
        next();
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error checking admin status:'), error);
        return res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while checking admin status.'
        });
    }
}

// Admin dashboard
router.get('/', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Admin dashboard accessed'));
        
        // Fetch all users and servers
        const [users, servers] = await Promise.all([
            getUsers(),
            getServers()
        ]);
        
        // Format server data to match template expectations
        const formattedServers = servers.map(server => ({
            ...server,
            limits: {
                memory: server.limits?.memory || 0,
                cpu: server.limits?.cpu || 0,
                disk: server.limits?.disk || 0,
                swap: server.limits?.swap || 0,
                io: server.limits?.io || 0
            },
            name: server.name || 'Unnamed Server',
            description: server.description || '',
            external_id: server.external_id || '',
            suspended: server.suspended || false,
            user: server.user || 'Unknown User',
            node: server.node || 'Unknown Node'
        }));
        
        // Get theme and render admin page
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add users and servers to render data
        renderData.users = users;
        renderData.servers = formattedServers;
        renderData.totalUsers = users.length;
        renderData.totalServers = formattedServers.length;
        renderData.activeUsers = Math.floor(users.length * 0.8); // Placeholder - replace with actual data
        renderData.revenue = Math.floor(Math.random() * 5000); // Placeholder - replace with actual data
        
        ejs.renderFile(
            `./themes/${theme.name}/${theme.settings.pages.admin || 'admin.ejs'}`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error in admin dashboard:'), error);
        res.status(500).send("An error occurred while loading the admin dashboard. Please try again later.");
    }
});

// Users management
router.get('/users', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Users management page accessed'));
        
        const users = await getUsers();
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add users to render data
        renderData.users = users;
        renderData.title = 'User Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/users.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin users page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin users page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading users management:'), error);
        res.status(500).send('An error occurred while loading the users management page.');
    }
});

// Server management
router.get('/servers', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Servers management page accessed'));
        
        // Get cached server and node data
        console.log(chalk.blue('[SERVERS] Using cached server data'));
        const serversPath = './cache/servers_cache.json';
        const servers = fs.existsSync(serversPath) 
            ? JSON.parse(fs.readFileSync(serversPath, 'utf8')) 
            : await getServers();
        
        console.log(chalk.blue('[NODES] Using cached node data'));
        const nodesPath = './cache/nodes_cache.json';
        const nodes = fs.existsSync(nodesPath) 
            ? JSON.parse(fs.readFileSync(nodesPath, 'utf8')) 
            : await getNodes();

        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add servers and nodes to render data
        renderData.servers = servers;
        renderData.nodes = nodes;
        renderData.title = 'Server Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/${theme.settings.pages.adminservers || 'admin/servers.ejs'}`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin servers page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin servers page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading servers management:'), error);
        res.status(500).send('An error occurred while loading the servers management page.');
    }
});

// Update server details
router.post('/servers/:id/details', checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        const serverData = req.body;

        console.log(chalk.blue(`[ADMIN] Updating server ${serverId} details`));
        
        await updateServerDetails(serverId, serverData);
        
        // Send webhook if enabled
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Server ${serverId} details updated by admin ${req.session.pterodactyl.username}`
            };
            
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/servers');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error updating server ${req.params.id} details:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while updating server details.'
        });
    }
});

// Update server build
router.post('/servers/:id/build', checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        const buildData = req.body;

        console.log(chalk.blue(`[ADMIN] Updating server ${serverId} build`));
        
        await updateServerBuild(serverId, buildData);
        
        // Send webhook if enabled
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Server ${serverId} build updated by admin ${req.session.pterodactyl.username}`
            };
            
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/servers');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error updating server ${req.params.id} build:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while updating server build.'
        });
    }
});

// Suspend server
router.post('/servers/:id/suspend', checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;

        console.log(chalk.blue(`[ADMIN] Suspending server ${serverId}`));
        
        await suspendServer(serverId);
        
        // Send webhook if enabled
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Server ${serverId} suspended by admin ${req.session.pterodactyl.username}`
            };
            
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/servers');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error suspending server ${req.params.id}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while suspending the server.'
        });
    }
});

// Unsuspend server
router.post('/servers/:id/unsuspend', checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;

        console.log(chalk.blue(`[ADMIN] Unsuspending server ${serverId}`));
        
        await unsuspendServer(serverId);
        
        // Send webhook if enabled
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Server ${serverId} unsuspended by admin ${req.session.pterodactyl.username}`
            };
            
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/servers');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error unsuspending server ${req.params.id}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while unsuspending the server.'
        });
    }
});

// Delete server
router.post('/servers/:id/delete', checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.id;
        const force = req.body.force === 'true';

        console.log(chalk.blue(`[ADMIN] Deleting server ${serverId} (force: ${force})`));
        
        await deleteServer(serverId, force);
        
        // Send webhook if enabled
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Server ${serverId} deleted by admin ${req.session.pterodactyl.username} (force: ${force})`
            };
            
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/servers');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error deleting server ${req.params.id}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while deleting the server.'
        });
    }
});

// Set user coins
router.post('/users/:id/setcoins', checkAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const coins = parseInt(req.body.coins);

        if (isNaN(coins)) {
            throw new Error('Invalid coins amount');
        }

        console.log(chalk.blue(`[ADMIN] Setting coins for user ${userId} to ${coins}`));
        
        // Get current user data
        const user = await getUserById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Update user with new coins
        await updateUser(userId, {
            coins: coins
        });
        
        // Send webhook if enabled
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Coins set to ${coins} for user ${user.username} by admin ${req.session.pterodactyl.username}`
            };
            
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/users');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error setting coins for user ${req.params.id}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while setting user coins.'
        });
    }
});

// Admin settings route
router.get("/admin/settings", checkAdmin, async (req, res) => {
    console.log(`[ADMIN] Admin ${req.session.userinfo.id} accessed admin settings`);
    let theme = indexjs.get(req);
    
    try {
        // Load settings
        let settingsData = JSON.parse(fs.readFileSync("./settings.json"));
        
        // Store in session for use in template
        req.session.adminSettings = settingsData;
        
        // Get render data and render the settings template
        ejs.renderFile(
            `./themes/${theme.name}/admin.ejs`, 
            await eval(indexjs.renderdataeval),
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin settings:`));
                    console.log(err);
                    return res.send("An error has occurred while loading the admin settings. Please contact an administrator to fix this.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error('[ADMIN] Error preparing admin settings data:', error);
        return res.status(500).send("An error occurred while preparing admin settings data. Please try again later.");
    }
});

// Save admin settings route
router.post("/admin/settings/save", checkAdmin, async (req, res) => {
    console.log(`[ADMIN] Admin ${req.session.userinfo.id} saving admin settings`);
    let theme = indexjs.get(req);
    
    try {
        // Get current settings
        let settingsData = JSON.parse(fs.readFileSync("./settings.json"));
        
        // Update settings based on form data
        if (req.body.website_name) {
            if (!settingsData.api) settingsData.api = {};
            if (!settingsData.api.client) settingsData.api.client = {};
            if (!settingsData.api.client.allow) settingsData.api.client.allow = {};
            
            // Update general settings
            if (req.body.website_name) settingsData.website.name = req.body.website_name;
            if (req.body.website_url) settingsData.website.url = req.body.website_url;
            if (req.body.website_port) settingsData.website.port = parseInt(req.body.website_port);
            
            // Update server creation settings
            if (req.body.server_create !== undefined) {
                if (!settingsData.api.client.allow.server) settingsData.api.client.allow.server = {};
                settingsData.api.client.allow.server.create = req.body.server_create === 'true';
            }
            
            // Update panel URL and API key
            if (req.body.pterodactyl_domain) settingsData.pterodactyl.domain = req.body.pterodactyl_domain;
            if (req.body.pterodactyl_key) settingsData.pterodactyl.key = req.body.pterodactyl_key;
            
            // Save the updated settings
            fs.writeFileSync("./settings.json", JSON.stringify(settingsData, null, 4));
            
            // Log the action
            console.log(`[ADMIN] Settings updated by admin ${req.session.userinfo.id}`);
            
            // Send webhook notification if enabled
            if(settingsData.api.client.webhook.auditlogs.enabled && !settingsData.api.client.webhook.auditlogs.disabled.includes("ADMIN")) {
                let tag = `${req.session.pterodactyl.first_name}${req.session.pterodactyl.last_name}`;
                let params = JSON.stringify({
                    embeds: [
                        {
                            title: "Settings Updated",
                            description: `**__Admin:__** ${tag} (<@${req.session.userinfo.id}>)\n\n**Settings:** Admin updated dashboard settings`,
                            color: hexToDecimal("#ffff00")
                        }
                    ]
                });
                
                fetch(`${settingsData.api.client.webhook.webhook_url}`, {
                    method: "POST",
                    headers: {
                        'Content-type': 'application/json',
                    },
                    body: params
                }).catch(e => console.warn(chalk.red("[WEBSITE] There was an error sending to the webhook: " + e)));
            }
            
            return res.redirect("/admin/settings?success=true");
        } else {
            return res.redirect("/admin/settings?err=MISSINGVALUES");
        }
    } catch (error) {
        console.error('[ADMIN] Error saving admin settings:', error);
        return res.redirect("/admin/settings?err=SAVEFAILED");
    }
});

// Eggs and Nests Management
router.get('/nests', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Nests management page accessed'));
        
        const [nests, eggs] = await Promise.all([
            getNests(true), // Force update to get fresh data
            getEggs(true)  // Force update to get fresh data
        ]);
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add nests and eggs to render data
        renderData.nests = nests;
        renderData.eggs = eggs;
        renderData.title = 'Nests & Eggs Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/nests.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin nests page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin nests page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading nests management:'), error);
        res.status(500).send('An error occurred while loading the nests management page.');
    }
});

// Create new nest
router.post('/nests', checkAdmin, async (req, res) => {
    try {
        const nestData = req.body;
        console.log(chalk.blue('[ADMIN] Creating new nest'));
        
        await createNest(nestData);
        
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `New nest created by admin ${req.session.pterodactyl.username}`
            };
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/nests');
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error creating nest:'), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while creating the nest.'
        });
    }
});

// Update nest
router.put('/nests/:id', checkAdmin, async (req, res) => {
    try {
        const nestId = req.params.id;
        const nestData = req.body;
        console.log(chalk.blue(`[ADMIN] Updating nest ${nestId}`));
        
        await updateNest(nestId, nestData);
        
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Nest ${nestId} updated by admin ${req.session.pterodactyl.username}`
            };
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/nests');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error updating nest ${req.params.id}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while updating the nest.'
        });
    }
});

// Delete nest
router.delete('/nests/:id', checkAdmin, async (req, res) => {
    try {
        const nestId = req.params.id;
        console.log(chalk.blue(`[ADMIN] Deleting nest ${nestId}`));
        
        await deleteNest(nestId);
        
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Nest ${nestId} deleted by admin ${req.session.pterodactyl.username}`
            };
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/nests');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error deleting nest ${req.params.id}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while deleting the nest.'
        });
    }
});

// Create new egg
router.post('/nests/:nestId/eggs', checkAdmin, async (req, res) => {
    try {
        const nestId = req.params.nestId;
        const eggData = req.body;
        console.log(chalk.blue(`[ADMIN] Creating new egg in nest ${nestId}`));
        
        await createEgg(nestId, eggData);
        
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `New egg created in nest ${nestId} by admin ${req.session.pterodactyl.username}`
            };
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/nests');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error creating egg in nest ${req.params.nestId}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while creating the egg.'
        });
    }
});

// Update egg
router.put('/nests/:nestId/eggs/:eggId', checkAdmin, async (req, res) => {
    try {
        const { nestId, eggId } = req.params;
        const eggData = req.body;
        console.log(chalk.blue(`[ADMIN] Updating egg ${eggId} in nest ${nestId}`));
        
        await updateEgg(nestId, eggId, eggData);
        
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Egg ${eggId} in nest ${nestId} updated by admin ${req.session.pterodactyl.username}`
            };
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/nests');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error updating egg ${req.params.eggId}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while updating the egg.'
        });
    }
});

// Delete egg
router.delete('/nests/:nestId/eggs/:eggId', checkAdmin, async (req, res) => {
    try {
        const { nestId, eggId } = req.params;
        console.log(chalk.blue(`[ADMIN] Deleting egg ${eggId} from nest ${nestId}`));
        
        await deleteEgg(nestId, eggId);
        
        if (settings.webhook.enabled) {
            const webhookData = {
                content: `Egg ${eggId} in nest ${nestId} deleted by admin ${req.session.pterodactyl.username}`
            };
            await fetch(settings.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookData)
            });
        }
        
        res.redirect('/admin/nests');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error deleting egg ${req.params.eggId}:`), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while deleting the egg.'
        });
    }
});

// Settings Management
router.get('/settings', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Settings management page accessed'));
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add settings to render data
        renderData.settings = settings;
        renderData.title = 'Settings Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/settings.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin settings page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin settings page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading settings management:'), error);
        res.status(500).send('An error occurred while loading the settings management page.');
    }
});

// Nodes Management
router.get('/nodes', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Nodes management page accessed'));
        
        // Fetch nodes and locations
        const [nodes, locations] = await Promise.all([
            getNodes(),
            getNestById(1) // Using nest 1 as a placeholder for locations
        ]);
        
        // Calculate resource statistics
        const totalServers = nodes.reduce((sum, node) => sum + (node.servers || 0), 0);
        const totalMemory = nodes.reduce((sum, node) => sum + (node.memory || 0), 0);
        const availableMemory = nodes.reduce((sum, node) => sum + ((node.memory || 0) - (node.memory_usage || 0)), 0);
        const totalDisk = nodes.reduce((sum, node) => sum + (node.disk || 0), 0);
        const availableDisk = nodes.reduce((sum, node) => sum + ((node.disk || 0) - (node.disk_usage || 0)), 0);
        const totalAllocations = nodes.reduce((sum, node) => sum + (node.allocations?.length || 0), 0);
        const availableAllocations = nodes.reduce((sum, node) => sum + (node.allocations?.filter(a => !a.assigned)?.length || 0), 0);
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add data to render
        renderData.nodes = nodes;
        renderData.locations = locations || [];
        renderData.totalServers = totalServers;
        renderData.totalMemory = totalMemory;
        renderData.availableMemory = availableMemory;
        renderData.totalDisk = totalDisk;
        renderData.availableDisk = availableDisk;
        renderData.totalAllocations = totalAllocations;
        renderData.availableAllocations = availableAllocations;
        renderData.title = 'Node Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/nodes.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin nodes page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin nodes page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading nodes management:'), error);
        res.status(500).send('An error occurred while loading the nodes management page.');
    }
});

// Locations Management
router.get('/locations', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Locations management page accessed'));
        
        // Get all locations
        let locations = [];
        try {
            const response = await axios.get(
                `${process.env.PTERODACTYL_DOMAIN}/api/application/locations`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (response.data && response.data.data) {
                locations = response.data.data.map(location => ({
                    id: location.attributes.id,
                    short: location.attributes.short,
                    long: location.attributes.long,
                    nodes: location.attributes.relationships?.nodes?.data?.length || 0
                }));
            }
        } catch (error) {
            console.error(chalk.red('[ADMIN] Error fetching locations:'), error.message);
            // Continue with empty locations array
        }
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add locations to render data
        renderData.locations = locations;
        renderData.title = 'Location Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/locations.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin locations page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin locations page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading locations management:'), error);
        res.status(500).send('An error occurred while loading the locations management page.');
    }
});

// Mounts Management
router.get('/mounts', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Mounts management page accessed'));
        
        const nodes = await getNodes(true);
        
        // Get all mounts
        let mounts = [];
        try {
            const response = await axios.get(`${process.env.PTERODACTYL_DOMAIN}/api/application/mounts`, {
                headers: {
                    'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (response.data && response.data.data) {
                mounts = response.data.data;
            }
        } catch (error) {
            console.error(chalk.red('[ADMIN] Error fetching mounts:'), error.message);
            // Continue with empty mounts array
        }
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add data to render
        renderData.mounts = mounts;
        renderData.nodes = nodes;
        renderData.title = 'Mounts Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/mounts.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin mounts page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin mounts page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading mounts management:'), error);
        res.status(500).send('An error occurred while loading the mounts management page.');
    }
});

// Databases Management
router.get('/databases', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Databases management page accessed'));
        
        // Get all nodes for reference
        const nodes = await getNodes(true);
        
        // Get all database hosts
        let databaseHosts = [];
        try {
            const response = await axios.get(
                `${process.env.PTERODACTYL_DOMAIN}/api/application/database-hosts`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (response.data && response.data.data) {
                databaseHosts = response.data.data.map(host => ({
                    id: host.attributes.id,
                    name: host.attributes.name,
                    host: host.attributes.host,
                    port: host.attributes.port,
                    username: host.attributes.username,
                    max_databases: host.attributes.max_databases,
                    database_count: host.attributes.relationships?.databases?.data?.length || 0,
                    node_id: host.attributes.node,
                    node_name: nodes.find(n => n.id === host.attributes.node)?.name || 'Unknown',
                    type: host.attributes.driver
                }));
            }
        } catch (error) {
            console.error(chalk.red('[ADMIN] Error fetching database hosts:'), error.message);
            // Continue with empty database hosts array
        }
        
        // Get all databases
        let databases = [];
        try {
            const response = await axios.get(
                `${process.env.PTERODACTYL_DOMAIN}/api/application/databases`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (response.data && response.data.data) {
                databases = response.data.data.map(db => ({
                    id: db.attributes.id,
                    name: db.attributes.name,
                    host_id: db.attributes.host_id,
                    host_name: databaseHosts.find(h => h.id === db.attributes.host_id)?.name || 'Unknown',
                    server_id: db.attributes.server,
                    username: db.attributes.username,
                    connections_from: db.attributes.connections_from,
                    max_connections: db.attributes.max_connections,
                    created_at: new Date(db.attributes.created_at).toLocaleString()
                }));
            }
        } catch (error) {
            console.error(chalk.red('[ADMIN] Error fetching databases:'), error.message);
            // Continue with empty databases array
        }
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add data to render
        renderData.databaseHosts = databaseHosts;
        renderData.databases = databases;
        renderData.nodes = nodes;
        renderData.title = 'Database Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/databases.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin databases page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin databases page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading databases management:'), error);
        res.status(500).send('An error occurred while loading the databases management page.');
    }
});

// Allocations Management
router.get('/allocations', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Allocations management page accessed'));
        
        // Get all nodes
        const nodes = await getNodes(true);
        
        // Get all allocations from all nodes
        let allocations = [];
        for (const node of nodes) {
            try {
                const nodeAllocations = await axios.get(
                    `${process.env.PTERODACTYL_DOMAIN}/api/application/nodes/${node.id}/allocations`,
                    {
                        headers: {
                            'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    }
                );
                
                if (nodeAllocations.data && nodeAllocations.data.data) {
                    // Add the node name and FQDN to each allocation
                    const formattedAllocations = nodeAllocations.data.data.map(alloc => ({
                        ...alloc.attributes,
                        node_name: node.name,
                        node_fqdn: node.fqdn
                    }));
                    
                    allocations = [...allocations, ...formattedAllocations];
                }
            } catch (error) {
                console.error(chalk.red(`[ADMIN] Error fetching allocations for node ${node.id}:`), error.message);
                // Continue with other nodes
            }
        }
        
        // Get theme and render properly
        let theme = indexjs.get(req);
        const renderData = await eval(indexjs.renderdataeval);
        
        // Add allocations and nodes to render data
        renderData.allocations = allocations;
        renderData.nodes = nodes;
        renderData.title = 'Allocation Management';
        
        ejs.renderFile(
            `./themes/${theme.name}/admin/allocations.ejs`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[ADMIN] Error rendering admin allocations page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the admin allocations page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading allocations management:'), error);
        res.status(500).send('An error occurred while loading the allocations management page.');
    }
});

// Allocations POST endpoints
router.post('/allocations/create', checkAdmin, async (req, res) => {
    try {
        const { node_id, ip, port, alias } = req.body;
        console.log(chalk.blue(`[ADMIN] Creating new allocation on node ${node_id}`));
        
        // Make API request to create allocation
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${node_id}/allocations`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify({
                    ip: ip,
                    ports: [port.toString()],
                    alias: alias || null
                })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to create allocation: ${response.status} ${response.statusText}`);
        }
        
        console.log(chalk.green(`[ADMIN] Allocation created successfully on node ${node_id}`));
        res.redirect('/admin/allocations');
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error creating allocation:'), error);
        res.status(500).send('An error occurred while creating the allocation.');
    }
});

router.post('/allocations/bulk', checkAdmin, async (req, res) => {
    try {
        const { node_id, ip, port_start, port_end } = req.body;
        console.log(chalk.blue(`[ADMIN] Creating bulk allocations on node ${node_id}`));
        
        // Make API request to create allocations
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${node_id}/allocations`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify({
                    ip: ip,
                    ports: [`${port_start}-${port_end}`]
                })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to create allocations: ${response.status} ${response.statusText}`);
        }
        
        console.log(chalk.green(`[ADMIN] Bulk allocations created successfully on node ${node_id}`));
        res.redirect('/admin/allocations');
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error creating bulk allocations:'), error);
        res.status(500).send('An error occurred while creating bulk allocations.');
    }
});

router.get('/allocations/:id/delete', checkAdmin, async (req, res) => {
    try {
        const allocationId = req.params.id;
        console.log(chalk.blue(`[ADMIN] Deleting allocation ${allocationId}`));
        
        // Make API request to delete allocation
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/allocations/${allocationId}`,
            {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to delete allocation: ${response.status} ${response.statusText}`);
        }
        
        console.log(chalk.green(`[ADMIN] Allocation ${allocationId} deleted successfully`));
        res.redirect('/admin/allocations');
    } catch (error) {
        console.error(chalk.red(`[ADMIN] Error deleting allocation ${req.params.id}:`), error);
        res.status(500).send('An error occurred while deleting the allocation.');
    }
});

// Settings POST endpoint
router.post('/settings/general', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Updating general settings'));
        
        // Read current settings
        const settingsData = JSON.parse(fs.readFileSync("./settings.json").toString());
        
        // Update general settings
        settingsData.website = settingsData.website || {};
        if (req.body.site_name) settingsData.website.name = req.body.site_name;
        if (req.body.site_description) settingsData.website.description = req.body.site_description;
        if (req.body.favicon_url) settingsData.website.favicon = req.body.favicon_url;
        if (req.body.logo_url) settingsData.website.logo = req.body.logo_url;
        if (req.body.primary_color) settingsData.website.primaryColor = req.body.primary_color;
        if (req.body.analytics_id) settingsData.website.analytics = req.body.analytics_id;
        
        // Update maintenance settings
        settingsData.website.maintenance = {
            enabled: req.body.maintenance_mode === '1',
            message: req.body.maintenance_message || 'Our site is currently undergoing scheduled maintenance. Please check back soon!'
        };
        
        // Save updated settings
        fs.writeFileSync("./settings.json", JSON.stringify(settingsData, null, 4));
        
        console.log(chalk.green('[ADMIN] General settings updated successfully'));
        res.redirect('/admin/settings?success=true');
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error updating general settings:'), error);
        res.status(500).send('An error occurred while updating the settings.');
    }
});

router.post('/settings/panel', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Updating panel settings'));
        
        // Read current settings
        const settingsData = JSON.parse(fs.readFileSync("./settings.json").toString());
        
        // Update panel settings
        settingsData.pterodactyl = settingsData.pterodactyl || {};
        if (req.body.panel_url) settingsData.pterodactyl.domain = req.body.panel_url;
        if (req.body.pterodactyl_key) settingsData.pterodactyl.key = req.body.pterodactyl_key;
        
        // Update features
        settingsData.website = settingsData.website || {};
        settingsData.website.features = req.body.features || [];
        
        // Update renewal settings
        settingsData.renewal = settingsData.renewal || {};
        if (req.body.renewal_days) settingsData.renewal.days = parseInt(req.body.renewal_days);
        if (req.body.renewal_cost) settingsData.renewal.cost = parseInt(req.body.renewal_cost);
        
        // Save updated settings
        fs.writeFileSync("./settings.json", JSON.stringify(settingsData, null, 4));
        
        console.log(chalk.green('[ADMIN] Panel settings updated successfully'));
        res.redirect('/admin/settings?success=true');
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error updating panel settings:'), error);
        res.status(500).send('An error occurred while updating the settings.');
    }
});

module.exports = {
    router: router,
    suspend: async function(discordid) {
        let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());
        if (newsettings.api.client.allow.overresourcessuspend !== true) return;

        let canpass = await indexjs.islimited();
        if (canpass == false) {
            setTimeout(
                async function() {
                    adminjs.suspend(discordid);
                }, 1
            )
            return;
        };

        indexjs.ratelimits(1);
        let pterodactylid = await db.get("users-" + discordid);
        let userinforeq = await fetch(
            settings.pterodactyl.domain + "/api/application/users/" + pterodactylid + "?include=servers",
            {
              method: "get",
              headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
            }
          );
        if (await userinforeq.statusText == "Not Found") {
            console.log("[WEBSITE] An error has occured while attempting to check if a user's server should be suspended.");
            console.log("- Discord ID: " + discordid);
            console.log("- Pterodactyl Panel ID: " + pterodactylid);
            return;
        }
        let userinfo = JSON.parse(await userinforeq.text());

        let packagename = await db.get("package-" + discordid);
        let package = newsettings.api.client.packages.list[packagename || newsettings.api.client.packages.default];

        let extra = 
            await db.get("extra-" + discordid) ||
            {
                ram: 0,
                disk: 0,
                cpu: 0,
                servers: 0
            };

        let plan = {
            ram: package.ram + extra.ram,
            disk: package.disk + extra.disk,
            cpu: package.cpu + extra.cpu,
            servers: package.servers + extra.servers
        }

        let current = {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: userinfo.attributes.relationships.servers.data.length
        }
        for (let i = 0, len = userinfo.attributes.relationships.servers.data.length; i < len; i++) {
            current.ram = current.ram + userinfo.attributes.relationships.servers.data[i].attributes.limits.memory;
            current.disk = current.disk + userinfo.attributes.relationships.servers.data[i].attributes.limits.disk;
            current.cpu = current.cpu + userinfo.attributes.relationships.servers.data[i].attributes.limits.cpu;
        };

        indexjs.ratelimits(userinfo.attributes.relationships.servers.data.length);
        if (current.ram > plan.ram || current.disk > plan.disk || current.cpu > plan.cpu || current.servers > plan.servers) {
            for (let i = 0, len = userinfo.attributes.relationships.servers.data.length; i < len; i++) {
                let suspendid = userinfo.attributes.relationships.servers.data[i].attributes.id;
                await fetch(
                    settings.pterodactyl.domain + "/api/application/servers/" + suspendid + "/suspend",
                    {
                      method: "post",
                      headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
                    }
                  );
            }
        } else {
            if (settings.api.client.allow.renewsuspendsystem.enabled == true) return;
            for (let i = 0, len = userinfo.attributes.relationships.servers.data.length; i < len; i++) {
                let suspendid = userinfo.attributes.relationships.servers.data[i].attributes.id;
                await fetch(
                    settings.pterodactyl.domain + "/api/application/servers/" + suspendid + "/unsuspend",
                    {
                      method: "post",
                      headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
                    }
                  );
            }
        };
    },
    checkAdmin: checkAdmin
};
