const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const ejs = require("ejs");
const adminjs = require("./admin.js");
const renew = require("./renewal.js");
const path = require('path');
const chalk = require('chalk');

// Helper function to convert hex to decimal
function hexToDecimal(hex) {
    return parseInt(hex.replace("#", ""), 16);
}

// Clean up pterodactyl domain if needed
if (settings.pterodactyl && settings.pterodactyl.domain) {
    if (settings.pterodactyl.domain.slice(-1) == "/") {
        settings.pterodactyl.domain = settings.pterodactyl.domain.slice(0, -1);
    }
}

// Update user info route
router.get("/updateinfo", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    
    let cacheaccount = await fetch(
        settings.pterodactyl.domain + "/api/application/users/" + (await db.get("users-" + req.session.userinfo.id)) + "?include=servers",
        {
            method: "GET",
            headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
        }
    );

    if (await cacheaccount.statusText !== "OK") return res.send({ status: "ERROR", message: "Could not update user information." });

    let cacheaccountinfo = await cacheaccount.json();

    req.session.pterodactyl = cacheaccountinfo.attributes;
    if (req.query.redirect) return res.redirect(req.query.redirect);
    res.send({ status: "SUCCESS", message: "Updated user information." });
});

// Create server route
router.post('/servers/create', async (req, res) => {
    if (!req.session.userinfo || !req.session.pterodactyl) {
        return res.redirect('/login');
    }

    // Get user info
    const db = require('../index.js').db;
    try {
        const user = await db.users.getUserById(req.session.userinfo.id);
        if (!user || user.pterodactyl_id !== req.session.pterodactyl.id) {
            req.session.destroy();
            return res.redirect('/login');
        }

        // Check if server creation is enabled
        if (settings.api.client.allow.server.create !== true) {
            return res.redirect('/dashboard?error=servercreationdisabled');
        }

        // Get theme
        const theme = indexjs.get(req);

        // Get form data - use egg instead of type
        const name = req.body.name;
        const ram = parseInt(req.body.ram);
        const disk = parseInt(req.body.disk);
        const cpu = parseInt(req.body.cpu);
        const location = req.body.location;
        const egg = req.body.egg; // Changed from type to egg to match the form

        // Log received data for debugging
        console.log(`[SERVER CREATE] Received data: name=${name}, ram=${ram}, disk=${disk}, cpu=${cpu}, location=${location}, egg=${egg}`);

        // Validate input
        if (!name || isNaN(ram) || isNaN(disk) || isNaN(cpu) || !location || !egg) {
            console.log('[SERVER CREATE] Missing variable:', { name, ram, disk, cpu, location, egg });
            return res.redirect('/create?err=MISSINGVARIABLE');
        }

        // Check if user has enough resources
        // Get current usage
        let currentram = 0;
        let currentdisk = 0;
        let currentcpu = 0;
        let currentservers = 0;

        const servers = req.session.pterodactyl.relationships.servers.data;
        for (let i = 0; i < servers.length; i++) {
            const server = servers[i].attributes;
            currentram += server.limits.memory || 0;
            currentdisk += server.limits.disk || 0;
            currentcpu += server.limits.cpu || 0;
        }
        currentservers = servers.length;

        // Get package resources
        const package = await db.packages.getUserPackage(req.session.userinfo.id);
        const packagename = package ? package.name : settings.api.client.packages.default;
        const packagedata = settings.api.client.packages.list[packagename];

        // Check if user has enough resources
        if (ram + currentram > packagedata.ram) {
            return res.redirect(`/create?err=RAMEXCEED&err_ram=${ram}`);
        }
        if (disk + currentdisk > packagedata.disk) {
            return res.redirect(`/create?err=DISKEXCEED&err_disk=${disk}`);
        }
        if (cpu + currentcpu > packagedata.cpu) {
            return res.redirect(`/create?err=CPUEXCEED&err_cpu=${cpu}`);
        }
        if (currentservers >= packagedata.servers) {
            return res.redirect('/create?err=SERVEREXCEED');
        }

        // Check minimum requirements
        if (ram < 1024) {
            return res.redirect('/create?err=NOTENOUGHRAM');
        }
        if (disk < 1024) {
            return res.redirect('/create?err=NOTENOUGHDISK');
        }
        if (cpu < 10) {
            return res.redirect('/create?err=NOTENOUGHCPU');
        }

        // Get egg info
        let nest_id;
        let egg_id = egg; // Use the egg ID directly from the form

        // Get egg info from cache
        let eggInfo = {};
        try {
            // Try to get egg info from cache
            const eggCache = JSON.parse(fs.readFileSync(path.join(__dirname, '../cache/eggs.json')));
            if (eggCache[egg_id]) {
                console.log(`[SERVER CREATE] Using egg info from cache for egg ID ${egg_id}`);
                
                // Get the nest ID from the egg cache
                nest_id = eggCache[egg_id].nestId || 1;
                
                eggInfo = {
                    docker_image: eggCache[egg_id].docker_image,
                    startup: eggCache[egg_id].startup,
                    environment: {}
                };
                
                // Add environment variables with default values
                eggCache[egg_id].variables.forEach(variable => {
                    eggInfo.environment[variable.env_variable] = variable.default_value;
                });

                // Set feature limits
                eggInfo.feature_limits = {
                    databases: 1,
                    backups: 1,
                    allocations: 1
                };
            } else {
                // Fallback to a default configuration
                console.log('[SERVER CREATE] Egg not found in cache, using default configuration');
                nest_id = 1;
                eggInfo = {
                    docker_image: "quay.io/pterodactyl/core:java",
                    startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
                    environment: {
                        SERVER_JARFILE: "server.jar"
                    },
                    feature_limits: {
                        databases: 1,
                        backups: 1,
                        allocations: 1
                    }
                };
            }
        } catch (error) {
            console.error('Error getting egg info:', error);
            // Use a default configuration
            nest_id = 1;
            eggInfo = {
                docker_image: "quay.io/pterodactyl/core:java",
                startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
                environment: {
                    SERVER_JARFILE: "server.jar"
                },
                feature_limits: {
                    databases: 1,
                    backups: 1,
                    allocations: 1
                }
            };
        }

        // Create server on Pterodactyl
        console.log(`[SERVER CREATE] Creating server with name: ${name}, ram: ${ram}, disk: ${disk}, cpu: ${cpu}, location: ${location}, nest: ${nest_id}, egg: ${egg_id}`);
        
        try {
            const serverData = {
                name: name,
                user: req.session.pterodactyl.id, // Automatically set the user ID
                egg: egg_id,
                docker_image: eggInfo.docker_image,
                startup: eggInfo.startup,
                environment: eggInfo.environment,
                limits: {
                    memory: ram,
                    swap: 0,
                    disk: disk,
                    io: 500,
                    cpu: cpu
                },
                feature_limits: eggInfo.feature_limits,
                allocation: {
                    default: 0
                },
                deploy: {
                    locations: [parseInt(location)],
                    dedicated_ip: false,
                    port_range: []
                },
                start_on_completion: true,
                nest: nest_id
            };

            console.log(`[SERVER CREATE] Sending request to Pterodactyl API with data:`, JSON.stringify(serverData, null, 2));

            const response = await fetch(`${settings.pterodactyl.domain}/api/application/servers`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${settings.pterodactyl.key}`,
                    "Accept": "application/json"
                },
                body: JSON.stringify(serverData)
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('[SERVER CREATE] Error response from Pterodactyl API:', error);
                
                // Check for specific error messages
                if (error.errors && error.errors.length > 0) {
                    const errorDetail = error.errors[0].detail;
                    if (errorDetail.includes("environment")) {
                        console.error('[SERVER CREATE] Environment variable error:', errorDetail);
                        return res.redirect('/create?err=ENVVARIABLEERROR');
                    }
                }
                
                return res.redirect('/create?err=CREATEFAILED');
            }

            const serverResponse = await response.json();
            console.log(`[SERVER CREATE] Server created successfully. Server ID: ${serverResponse.attributes.id}`);

            // Server created successfully, redirect to server list
            let redirectPath = theme.settings.redirect.createserver || "/servers";
            return res.redirect(redirectPath);
        } catch (error) {
            console.error('[SERVER CREATE] Error creating server:', error);
            return res.redirect('/create?err=CREATEFAILED');
        }
    } catch (error) {
        console.error('[SERVER CREATE] Error handling server creation:', error);
        return res.redirect('/create?err=CREATEFAILED');
    }
});

// Delete server route
router.get("/delete", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let theme = indexjs.get(req);

    if (!req.query.id) return res.redirect(theme.settings.redirect.missingvariables || "/");

    let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());
    if (newsettings.api.client.allow.server.delete !== true) {
        return res.send("Server deletion is currently disabled.");
    }

    let discordid = req.session.userinfo.id;
    let serverinfo = await db.get("server-" + req.query.id);

    if (!serverinfo || serverinfo.owner !== discordid) {
        return res.redirect(theme.settings.redirect.invalidserver || "/");
    }

    let deleteserver = await fetch(
        settings.pterodactyl.domain + "/api/application/servers/" + req.query.id,
        {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
        }
    );

    if (await deleteserver.statusText !== "No Content") {
        return res.redirect(theme.settings.redirect.serverdeletionfailed || "/");
    }

    await db.delete("server-" + req.query.id);

    res.redirect(theme.settings.redirect.serverdeletion || "/");
});

// Edit server route
router.get('/edit/:id', async (req, res) => {
    if (!req.session.userinfo || !req.session.pterodactyl) {
        return res.redirect('/login');
    }

    try {
        const serverId = req.params.id;
        const theme = indexjs.get(req);

        // Get server details
        const server = await getServerById(serverId);
        if (!server) {
            return res.redirect('/servers?err=SERVERNOTFOUND');
        }

        // Check if user owns this server
        if (server.user !== req.session.pterodactyl.id) {
            return res.redirect('/servers?err=NOTOWNER');
        }

        // Render the edit page
        ejs.renderFile(
            `./themes/${theme.name}/edit.ejs`,
            await eval(indexjs.renderdataeval),
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[SERVERS] Error rendering edit page:`));
                    console.log(err);
                    return res.send("An error has occurred while loading the edit page. Please contact an administrator to fix this.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error(chalk.red('[SERVERS] Error loading edit page:'), error);
        res.redirect('/servers?err=LOADERROR');
    }
});

// Update server route
router.put('/:id', async (req, res) => {
    if (!req.session.userinfo || !req.session.pterodactyl) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    try {
        const serverId = req.params.id;
        const { name, description, cpu, memory, disk } = req.body;

        // Validate input
        if (!name || isNaN(cpu) || isNaN(memory) || isNaN(disk)) {
            return res.status(400).json({ success: false, error: 'Invalid input' });
        }

        // Get server details
        const server = await getServerById(serverId);
        if (!server) {
            return res.status(404).json({ success: false, error: 'Server not found' });
        }

        // Check if user owns this server
        if (server.user !== req.session.pterodactyl.id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Update server details
        await updateServerDetails(serverId, {
            name,
            description,
            user: server.user,
            external_id: server.external_id
        });

        // Update server build
        await updateServerBuild(serverId, {
            cpu,
            memory,
            disk,
            swap: 0,
            io: 500,
            threads: null,
            oom_disabled: false,
            allocation_id: server.allocation,
            feature_limits: {
                databases: 0,
                backups: 0,
                allocations: 1
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error(chalk.red('[SERVERS] Error updating server:'), error);
        res.status(500).json({ success: false, error: 'Failed to update server' });
    }
});

// Export the router
module.exports = {
    router: router
};
