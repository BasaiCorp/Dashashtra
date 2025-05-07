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
const userCoins = require('./user_coins.js');
const eggHandler = require('./egg_handler.js');
const eggVariables = require('./fetch_required_variables.js');

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
        
        // Convert both IDs to strings for consistent comparison
        const userPteroId = String(user.pterodactyl_id);
        const sessionPteroId = String(req.session.pterodactyl.id);
        
        if (!user || userPteroId !== sessionPteroId) {
            req.session.destroy((err) => {
                if (err) console.error("Error destroying session:", err);
                return res.redirect("/login");
            });
            return;
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
        const port = parseInt(req.body.port) || 1;
        const database = parseInt(req.body.database) || 0;
        const backup = parseInt(req.body.backup) || 0;
        const allocation = parseInt(req.body.allocation) || 0;
        const location = req.body.location;
        const egg = req.body.egg; // Changed from type to egg to match the form

        // Log received data for debugging
        console.log(`[SERVER CREATE] Received data: name=${name}, ram=${ram}, disk=${disk}, cpu=${cpu}, port=${port}, database=${database}, backup=${backup}, allocation=${allocation}, location=${location}, egg=${egg}`);

        // Validate input
        if (!name || isNaN(ram) || isNaN(disk) || isNaN(cpu) || isNaN(port) || !location || !egg) {
            console.log('[SERVER CREATE] Missing variable:', { name, ram, disk, cpu, port, location, egg });
            return res.redirect('/create?err=MISSINGVARIABLE');
        }

        // Check if user has enough resources
        // Get current usage
        let currentram = 0;
        let currentdisk = 0;
        let currentcpu = 0;
        let currentservers = 0;
        let currentport = 0;
        let currentdatabase = 0;
        let currentbackup = 0;
        let currentallocation = 0;

        const servers = req.session.pterodactyl.relationships.servers.data;
        for (let i = 0; i < servers.length; i++) {
            const server = servers[i].attributes;
            currentram += server.limits.memory || 0;
            currentdisk += server.limits.disk || 0;
            currentcpu += server.limits.cpu || 0;
            
            // Count feature limits if available
            if (server.feature_limits) {
                currentdatabase += server.feature_limits.databases || 0;
                currentbackup += server.feature_limits.backups || 0;
                currentallocation += server.feature_limits.allocations || 0;
            }
            
            // Count at least one port per server
            currentport += 1;
        }
        currentservers = servers.length;

        // Get package resources
        const package = await db.packages.getUserPackage(req.session.userinfo.id);
        const packagename = package ? package.name : settings.api.client.packages.default;
        const packagedata = settings.api.client.packages.list[packagename];
        
        // Get extra resources purchased from store
        const extraResources = await db.resources.getUserResources(req.session.userinfo.id);
        
        // Calculate total available resources (package + extra)
        const totalRam = packagedata.ram + extraResources.ram;
        const totalDisk = packagedata.disk + extraResources.disk; 
        const totalCpu = packagedata.cpu + extraResources.cpu;
        const totalServers = packagedata.servers + extraResources.servers;
        const totalPort = (packagedata.port || 0) + (extraResources.port || 0);
        const totalDatabase = (packagedata.database || 0) + (extraResources.database || 0);
        const totalBackup = (packagedata.backup || 0) + (extraResources.backup || 0);
        const totalAllocation = (packagedata.allocation || 0) + (extraResources.allocation || 0);

        // Check if user has enough resources
        if (ram + currentram > totalRam) {
            return res.redirect(`/create?err=RAMEXCEED&err_ram=${ram}`);
        }
        if (disk + currentdisk > totalDisk) {
            return res.redirect(`/create?err=DISKEXCEED&err_disk=${disk}`);
        }
        if (cpu + currentcpu > totalCpu) {
            return res.redirect(`/create?err=CPUEXCEED&err_cpu=${cpu}`);
        }
        if (currentservers >= totalServers) {
            return res.redirect('/create?err=SERVEREXCEED');
        }
        if (port + currentport > totalPort) {
            return res.redirect(`/create?err=PORTEXCEED&err_port=${port}`);
        }
        if (database + currentdatabase > totalDatabase) {
            return res.redirect(`/create?err=DATABASEEXCEED&err_database=${database}`);
        }
        if (backup + currentbackup > totalBackup) {
            return res.redirect(`/create?err=BACKUPEXCEED&err_backup=${backup}`);
        }
        if (allocation + currentallocation > totalAllocation) {
            return res.redirect(`/create?err=ALLOCATIONEXCEED&err_allocation=${allocation}`);
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

        // Get required variables for this egg
        try {
            const requiredVariables = await eggVariables.getRequiredVariables(egg_id);
            
            // Check if all required variables are provided
            if (requiredVariables.length > 0) {
                console.log('[SERVER CREATE] Required variables for egg:', requiredVariables);
                
                // Check if all required variables are present in the form data
                for (const variable of requiredVariables) {
                    const envKey = variable.env_variable.toLowerCase();
                    
                    if (!req.body[envKey] && !variable.default_value) {
                        console.log(`[SERVER CREATE] Missing required variable: ${variable.name} (${envKey})`);
                        return res.redirect(`/create?err=MISSINGVARIABLE&missing=${envKey}`);
                    }
                }
            }
        } catch (error) {
            console.error('[SERVER CREATE] Error checking required variables:', error);
            // Continue with server creation even if we couldn't check variables
        }

        // Create server
        try {
            // Collect any additional environment variables from the form
            const additionalVars = {};
            for (const key in req.body) {
                // Check if the key might be an environment variable (lowercase with underscores)
                if (key.includes('_') && key === key.toLowerCase()) {
                    additionalVars[key.toUpperCase()] = req.body[key];
                }
            }

            // Log all available form data for debugging
            console.log('[SERVER CREATE] Form data:', req.body);

            // Use the egg handler to create server data with proper environment variables
            const serverData = eggHandler.createServerData({
                name: name,
                userId: req.session.pterodactyl.id,
                eggId: egg_id,
                ram: ram,
                disk: disk, 
                cpu: cpu,
                port: port,
                database: database,
                backup: backup,
                allocation: allocation,
                location: location,
                additionalEnvironment: additionalVars
            });

            // Log the server data being sent to Pterodactyl
            console.log('[SERVER CREATE] Server data to be sent:', JSON.stringify(serverData, null, 2));

            // Create server on Pterodactyl
            const response = await fetch(
                `${settings.pterodactyl.domain}/api/application/servers`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${settings.pterodactyl.key}`,
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(serverData)
                }
            );

            const responseData = await response.json();

            if (response.status === 201) {
                console.log(chalk.green(`[SERVER CREATE] Server created successfully for user ${req.session.userinfo.id}.`));
                
                // Update user's server list
                await fetch(
                    `${settings.pterodactyl.domain}/api/application/users/${req.session.pterodactyl.id}?include=servers`,
                    {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${settings.pterodactyl.key}`
                        }
                    }
                ).then(response => response.json())
                .then(data => {
                    req.session.pterodactyl = data.attributes;
                });
                
                return res.redirect('/dashboard?success=SERVERCREATED');
            } else {
                // Check for specific error types from Pterodactyl
                if (responseData.errors && responseData.errors.length > 0) {
                    const error = responseData.errors[0];
                    console.error('[SERVER CREATE] Failed to create server:', responseData);
                    
                    // Handle specific error codes
                    if (error.code === 'DaemonConnectionException') {
                        return res.redirect('/create?err=CONNECTIONERROR');
                    } else if (error.detail && error.detail.includes('allocation')) {
                        return res.redirect('/create?err=NOALLOCATIONS');
                    } else if (error.detail && error.detail.includes('location')) {
                        return res.redirect('/create?err=INVALIDLOCATION');
                    }
                }
                
                return res.redirect('/create?err=CREATEFAILED');
            }
        } catch (error) {
            console.error('[SERVER CREATE] Error creating server:', error);
            
            // Check for daemon connection issues
            if (error.message && error.message.includes('ECONNREFUSED')) {
                return res.redirect('/create?err=CONNECTIONERROR');
            }
            
            // Check if we have a JSON response with error details
            if (error.response && error.response.data && error.response.data.errors) {
                const pterodactylError = error.response.data.errors[0];
                if (pterodactylError.code === 'DaemonConnectionException') {
                    console.log('[SERVER CREATE] Daemon connection error detected');
                    return res.redirect('/create?err=CONNECTIONERROR');
                }
            }
            
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

// Purchase server resources
router.post('/api/servers/resources/purchase', async (req, res) => {
    if (!req.session.userinfo || !req.session.pterodactyl) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { serverId, resourceType, amount, cost } = req.body;
    const userId = req.session.userinfo.id;
    const userCoins = require('./user_coins.js');

    // Validate input
    if (!serverId || !resourceType || !amount || !cost) {
        return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    // Check if user has enough coins
    if (!userCoins.hasEnoughCoins(userId, cost)) {
        return res.status(400).json({ success: false, error: 'Insufficient coins' });
    }

    try {
        // Find the server in the user's server list
        const servers = req.session.pterodactyl.relationships.servers.data;
        const server = servers.find(s => s.attributes.identifier === serverId);

        if (!server) {
            return res.status(404).json({ success: false, error: 'Server not found' });
        }

        // Get current server limits
        const currentLimits = {
            ram: server.attributes.limits.memory,
            disk: server.attributes.limits.disk,
            cpu: server.attributes.limits.cpu
        };

        // Calculate new limits
        const newLimits = { ...currentLimits };
        
        switch (resourceType) {
            case 'ram':
                newLimits.ram = currentLimits.ram + parseInt(amount);
                break;
            case 'disk':
                newLimits.disk = currentLimits.disk + parseInt(amount);
                break;
            case 'cpu':
                newLimits.cpu = currentLimits.cpu + parseInt(amount);
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid resource type' });
        }

        // Update server limits on Pterodactyl
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${server.attributes.id}/build`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    allocation: server.attributes.allocation,
                    memory: newLimits.ram,
                    swap: 0,
                    disk: newLimits.disk,
                    io: 500,
                    cpu: newLimits.cpu,
                    threads: null,
                    feature_limits: server.attributes.feature_limits
                })
            }
        );

        if (response.status === 200) {
            // Deduct coins from user
            const newBalance = userCoins.removeCoins(userId, cost);
            
            // Also update in the old system for backward compatibility
            const db = require('../index.js').db;
            const currentCoins = await db.get(`coins-${userId}`) || 0;
            await db.set(`coins-${userId}`, Math.max(0, currentCoins - cost));
            
            console.log(chalk.green(`[STORE] User ${userId} purchased ${amount} ${resourceType} for server ${serverId}. Deducted ${cost} coins.`));
            
            // Update user's server list
            await fetch(
                `${settings.pterodactyl.domain}/api/application/users/${req.session.pterodactyl.id}?include=servers`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.pterodactyl.key}`
                    }
                }
            ).then(response => response.json())
            .then(data => {
                req.session.pterodactyl = data.attributes;
            });
            
            return res.json({ 
                success: true, 
                newBalance,
                newLimits
            });
        } else {
            const errorData = await response.json();
            console.error('[STORE] Failed to update server resources:', errorData);
            return res.status(500).json({ success: false, error: 'Failed to update server resources' });
        }
    } catch (error) {
        console.error('[STORE] Error purchasing resources:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get server stats
router.get('/api/servers/:serverId/stats', async (req, res) => {
    if (!req.session.userinfo || !req.session.pterodactyl) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { serverId } = req.params;

    try {
        // Find the server in the user's server list
        const servers = req.session.pterodactyl.relationships.servers.data;
        const server = servers.find(s => s.attributes.identifier === serverId);

        if (!server) {
            return res.status(404).json({ success: false, error: 'Server not found' });
        }

        // Return server stats
        return res.json({
            success: true,
            stats: {
                ram: server.attributes.limits.memory,
                disk: server.attributes.limits.disk,
                cpu: server.attributes.limits.cpu
            }
        });
    } catch (error) {
        console.error('[STORE] Error fetching server stats:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Export the router
module.exports = {
    router: router
};
