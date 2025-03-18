const settings = require("../settings.json");
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const express = require('express');
const router = express.Router();

// Make sure cache directory exists
const cacheDir = path.join(__dirname, '../cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

const SERVERS_CACHE_FILE = path.join(cacheDir, 'servers_cache.json');
const CACHE_TTL = 300000; // 5 minutes in milliseconds

// Initialize module
console.log('[SERVERS] Initializing server fetcher module...');

/**
 * Get all servers from Pterodactyl panel
 * @param {boolean} forceUpdate - Force cache update
 * @returns {Promise<Array>} - Array of server objects
 */
async function getServers(forceUpdate = false) {
    try {
        // Check if cache exists and is valid
        if (!forceUpdate && fs.existsSync(SERVERS_CACHE_FILE)) {
            const cacheStats = fs.statSync(SERVERS_CACHE_FILE);
            const cacheAge = Date.now() - cacheStats.mtimeMs;
            
            // If cache is still valid, use it
            if (cacheAge < CACHE_TTL) {
                const cacheData = JSON.parse(fs.readFileSync(SERVERS_CACHE_FILE, 'utf8'));
                console.log('[SERVERS] Using cached server data');
                return cacheData;
            }
        }
        
        // Update cache
        return await updateCache();
    } catch (error) {
        console.error(chalk.red('[SERVERS] Error getting servers:'), error);
        // If cache exists but is outdated, still use it as fallback
        if (fs.existsSync(SERVERS_CACHE_FILE)) {
            console.log(chalk.yellow('[SERVERS] Using outdated cache as fallback'));
            return JSON.parse(fs.readFileSync(SERVERS_CACHE_FILE, 'utf8'));
        }
        return [];
    }
}

/**
 * Get a single server by ID
 * @param {string} serverId - Pterodactyl server ID
 * @returns {Promise<object|null>} - Server object or null if not found
 */
async function getServerById(serverId) {
    try {
        console.log(`[SERVERS] Fetching server ${serverId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${serverId}?include=allocations,user,nest,egg,variables`,
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
            throw new Error(`Failed to fetch server: ${response.status} ${response.statusText}`);
        }
        
        const serverData = await response.json();
        return serverData.attributes;
    } catch (error) {
        console.error(chalk.red(`[SERVERS] Error fetching server ${serverId}:`), error);
        return null;
    }
}

/**
 * Get servers owned by a user
 * @param {string} userId - Pterodactyl user ID
 * @returns {Promise<Array>} - Array of server objects
 */
async function getServersByUser(userId) {
    try {
        const allServers = await getServers();
        return allServers.filter(server => server.user === userId);
    } catch (error) {
        console.error(chalk.red(`[SERVERS] Error getting servers for user ${userId}:`), error);
        return [];
    }
}

/**
 * Update the servers cache
 * @returns {Promise<Array>} - Array of server objects
 */
async function updateCache() {
    console.log('[SERVERS] Updating servers cache...');
    
    try {
        let allServers = [];
        let currentPage = 1;
        let hasNextPage = true;
        
        // Pterodactyl uses pagination, so we need to fetch all pages
        while (hasNextPage) {
            const response = await fetch(
                `${settings.pterodactyl.domain}/api/application/servers?page=${currentPage}&include=allocations,user,nest,egg`,
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
                throw new Error(`Failed to fetch servers: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            allServers = [...allServers, ...data.data];
            
            // Check if there's another page
            hasNextPage = data.meta.pagination.current_page < data.meta.pagination.total_pages;
            currentPage++;
            
            console.log(`[SERVERS] Fetched page ${data.meta.pagination.current_page}/${data.meta.pagination.total_pages}...`);
        }
        
        // Save to cache
        fs.writeFileSync(SERVERS_CACHE_FILE, JSON.stringify(allServers, null, 2));
        console.log(`[SERVERS] Cache updated with ${allServers.length} servers`);
        
        return allServers;
    } catch (error) {
        console.error(chalk.red('[SERVERS] Error updating servers cache:'), error);
        throw error;
    }
}

/**
 * Create a new server in Pterodactyl
 * @param {object} serverData - Server data
 * @returns {Promise<object>} - Created server object
 */
async function createServer(serverData) {
    try {
        console.log('[SERVERS] Creating new server in Pterodactyl...');
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(serverData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create server: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red('[SERVERS] Error creating server:'), error);
        throw error;
    }
}

/**
 * Update server details in Pterodactyl
 * @param {string} serverId - Pterodactyl server ID
 * @param {object} serverData - Server data to update
 * @returns {Promise<object>} - Updated server object
 */
async function updateServerDetails(serverId, serverData) {
    try {
        console.log(`[SERVERS] Updating server ${serverId} details in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${serverId}/details`,
            {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(serverData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update server details: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[SERVERS] Error updating server ${serverId} details:`), error);
        throw error;
    }
}

/**
 * Update server build in Pterodactyl
 * @param {string} serverId - Pterodactyl server ID
 * @param {object} buildData - Build data to update
 * @returns {Promise<object>} - Updated server object
 */
async function updateServerBuild(serverId, buildData) {
    try {
        console.log(`[SERVERS] Updating server ${serverId} build in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${serverId}/build`,
            {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(buildData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update server build: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[SERVERS] Error updating server ${serverId} build:`), error);
        throw error;
    }
}

/**
 * Suspend a server in Pterodactyl
 * @param {string} serverId - Pterodactyl server ID
 * @returns {Promise<boolean>} - Whether suspension was successful
 */
async function suspendServer(serverId) {
    try {
        console.log(`[SERVERS] Suspending server ${serverId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${serverId}/suspend`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to suspend server: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[SERVERS] Error suspending server ${serverId}:`), error);
        throw error;
    }
}

/**
 * Unsuspend a server in Pterodactyl
 * @param {string} serverId - Pterodactyl server ID
 * @returns {Promise<boolean>} - Whether unsuspension was successful
 */
async function unsuspendServer(serverId) {
    try {
        console.log(`[SERVERS] Unsuspending server ${serverId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${serverId}/unsuspend`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to unsuspend server: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[SERVERS] Error unsuspending server ${serverId}:`), error);
        throw error;
    }
}

/**
 * Delete a server from Pterodactyl
 * @param {string} serverId - Pterodactyl server ID
 * @param {boolean} force - Whether to force delete
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteServer(serverId, force = false) {
    try {
        console.log(`[SERVERS] Deleting server ${serverId} from Pterodactyl (force: ${force})...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${serverId}${force ? '/force' : ''}`,
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
            throw new Error(`Failed to delete server: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[SERVERS] Error deleting server ${serverId}:`), error);
        throw error;
    }
}

// Add API routes for admin panel
router.get('/admin/servers', async (req, res) => {
    try {
        const servers = await getServers(true);
        res.json({ servers });
    } catch (error) {
        console.error(chalk.red('[SERVERS] Error fetching data for admin:'), error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Initialize by warming up cache
(async () => {
    try {
        console.log('[SERVERS] Initializing cache...');
        await getServers(true);
        console.log('[SERVERS] Cache initialized successfully');
    } catch (err) {
        console.error(chalk.red('[SERVERS] Failed to initialize cache:'), err);
    }
})();

module.exports = {
    router,
    getServers,
    getServerById,
    getServersByUser,
    createServer,
    updateServerDetails,
    updateServerBuild,
    suspendServer,
    unsuspendServer,
    deleteServer
}; 