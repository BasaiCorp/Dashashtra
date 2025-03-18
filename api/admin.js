const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require("fs");
const indexjs = require("../index.js");
const ejs = require("ejs");
const chalk = require('chalk');
const { getUsers, getUserById, updateUser } = require('./fetch_users');
const { getServers, getServerById, updateServerDetails, updateServerBuild, suspendServer, unsuspendServer, deleteServer } = require('./fetch_servers');
const { getNodes, getNodeById, getNodeAllocations } = require('./fetch_nodes');
const { getNests, getEggs, getNestById, getEggById, createNest, updateNest, deleteNest, createEgg, updateEgg, deleteEgg } = require('./fetch_eggs');

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

        // Calculate statistics
        const stats = {
            totalUsers: users.length,
            totalServers: servers.length,
            activeServers: servers.filter(s => !s.suspended).length,
            suspendedServers: servers.filter(s => s.suspended).length
        };

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            users,
            servers,
            stats
        });
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading admin dashboard:'), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while loading the admin dashboard.'
        });
    }
});

// Users management
router.get('/users', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Users management page accessed'));
        
        const users = await getUsers();
        
        res.render('admin/users', {
            title: 'User Management',
            users
        });
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading users management:'), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while loading the users management page.'
        });
    }
});

// Server management
router.get('/servers', checkAdmin, async (req, res) => {
    try {
        console.log(chalk.blue('[ADMIN] Servers management page accessed'));
        
        const [servers, nodes] = await Promise.all([
            getServers(),
            getNodes()
        ]);

        // Get allocations for each node
        const nodesWithAllocations = await Promise.all(
            nodes.map(async node => {
                const allocations = await getNodeAllocations(node.id);
                return { ...node, allocations };
            })
        );
        
        res.render('admin/servers', {
            title: 'Server Management',
            servers,
            nodes: nodesWithAllocations
        });
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading servers management:'), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while loading the servers management page.'
        });
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
        
        res.render('admin/nests', {
            title: 'Nests & Eggs Management',
            nests,
            eggs
        });
    } catch (error) {
        console.error(chalk.red('[ADMIN] Error loading nests management:'), error);
        res.status(500).render('404', { 
            title: 'Error',
            error: 'An error occurred while loading the nests management page.'
        });
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
