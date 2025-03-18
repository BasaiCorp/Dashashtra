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

const NODES_CACHE_FILE = path.join(cacheDir, 'nodes_cache.json');
const CACHE_TTL = 300000; // 5 minutes in milliseconds

// Initialize module
console.log('[NODES] Initializing node fetcher module...');

/**
 * Get all nodes from Pterodactyl panel
 * @param {boolean} forceUpdate - Force cache update
 * @returns {Promise<Array>} - Array of node objects
 */
async function getNodes(forceUpdate = false) {
    try {
        // Check if cache exists and is valid
        if (!forceUpdate && fs.existsSync(NODES_CACHE_FILE)) {
            const cacheStats = fs.statSync(NODES_CACHE_FILE);
            const cacheAge = Date.now() - cacheStats.mtimeMs;
            
            // If cache is still valid, use it
            if (cacheAge < CACHE_TTL) {
                const cacheData = JSON.parse(fs.readFileSync(NODES_CACHE_FILE, 'utf8'));
                console.log('[NODES] Using cached node data');
                return cacheData;
            }
        }
        
        // Update cache
        return await updateCache();
    } catch (error) {
        console.error(chalk.red('[NODES] Error getting nodes:'), error);
        // If cache exists but is outdated, still use it as fallback
        if (fs.existsSync(NODES_CACHE_FILE)) {
            console.log(chalk.yellow('[NODES] Using outdated cache as fallback'));
            return JSON.parse(fs.readFileSync(NODES_CACHE_FILE, 'utf8'));
        }
        return [];
    }
}

/**
 * Get a single node by ID
 * @param {string} nodeId - Pterodactyl node ID
 * @returns {Promise<object|null>} - Node object or null if not found
 */
async function getNodeById(nodeId) {
    try {
        console.log(`[NODES] Fetching node ${nodeId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${nodeId}?include=allocations,servers`,
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
            throw new Error(`Failed to fetch node: ${response.status} ${response.statusText}`);
        }
        
        const nodeData = await response.json();
        return nodeData.attributes;
    } catch (error) {
        console.error(chalk.red(`[NODES] Error fetching node ${nodeId}:`), error);
        return null;
    }
}

/**
 * Update the nodes cache
 * @returns {Promise<Array>} - Array of node objects
 */
async function updateCache() {
    console.log('[NODES] Updating nodes cache...');
    
    try {
        let allNodes = [];
        let currentPage = 1;
        let hasNextPage = true;
        
        // Pterodactyl uses pagination, so we need to fetch all pages
        while (hasNextPage) {
            const response = await fetch(
                `${settings.pterodactyl.domain}/api/application/nodes?page=${currentPage}&include=allocations,servers`,
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
                throw new Error(`Failed to fetch nodes: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            allNodes = [...allNodes, ...data.data];
            
            // Check if there's another page
            hasNextPage = data.meta.pagination.current_page < data.meta.pagination.total_pages;
            currentPage++;
            
            console.log(`[NODES] Fetched page ${data.meta.pagination.current_page}/${data.meta.pagination.total_pages}...`);
        }
        
        // Save to cache
        fs.writeFileSync(NODES_CACHE_FILE, JSON.stringify(allNodes, null, 2));
        console.log(`[NODES] Cache updated with ${allNodes.length} nodes`);
        
        return allNodes;
    } catch (error) {
        console.error(chalk.red('[NODES] Error updating nodes cache:'), error);
        throw error;
    }
}

/**
 * Create a new node in Pterodactyl
 * @param {object} nodeData - Node data
 * @returns {Promise<object>} - Created node object
 */
async function createNode(nodeData) {
    try {
        console.log('[NODES] Creating new node in Pterodactyl...');
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(nodeData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create node: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red('[NODES] Error creating node:'), error);
        throw error;
    }
}

/**
 * Update node in Pterodactyl
 * @param {string} nodeId - Pterodactyl node ID
 * @param {object} nodeData - Node data to update
 * @returns {Promise<object>} - Updated node object
 */
async function updateNode(nodeId, nodeData) {
    try {
        console.log(`[NODES] Updating node ${nodeId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${nodeId}`,
            {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(nodeData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update node: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[NODES] Error updating node ${nodeId}:`), error);
        throw error;
    }
}

/**
 * Delete node from Pterodactyl
 * @param {string} nodeId - Pterodactyl node ID
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteNode(nodeId) {
    try {
        console.log(`[NODES] Deleting node ${nodeId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${nodeId}`,
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
            throw new Error(`Failed to delete node: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[NODES] Error deleting node ${nodeId}:`), error);
        throw error;
    }
}

/**
 * Get node allocations
 * @param {string} nodeId - Pterodactyl node ID
 * @returns {Promise<Array>} - Array of allocation objects
 */
async function getNodeAllocations(nodeId) {
    try {
        console.log(`[NODES] Fetching allocations for node ${nodeId}...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${nodeId}/allocations`,
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
            throw new Error(`Failed to fetch node allocations: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error(chalk.red(`[NODES] Error fetching allocations for node ${nodeId}:`), error);
        return [];
    }
}

/**
 * Create allocation for node
 * @param {string} nodeId - Pterodactyl node ID
 * @param {object} allocationData - Allocation data
 * @returns {Promise<object>} - Created allocation object
 */
async function createAllocation(nodeId, allocationData) {
    try {
        console.log(`[NODES] Creating allocation for node ${nodeId}...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${nodeId}/allocations`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(allocationData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create allocation: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[NODES] Error creating allocation for node ${nodeId}:`), error);
        throw error;
    }
}

/**
 * Delete allocation from node
 * @param {string} nodeId - Pterodactyl node ID
 * @param {string} allocationId - Allocation ID
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteAllocation(nodeId, allocationId) {
    try {
        console.log(`[NODES] Deleting allocation ${allocationId} from node ${nodeId}...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nodes/${nodeId}/allocations/${allocationId}`,
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
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[NODES] Error deleting allocation ${allocationId} from node ${nodeId}:`), error);
        throw error;
    }
}

// Add API routes for admin panel
router.get('/admin/nodes', async (req, res) => {
    try {
        const nodes = await getNodes(true);
        res.json({ nodes });
    } catch (error) {
        console.error(chalk.red('[NODES] Error fetching data for admin:'), error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Initialize by warming up cache
(async () => {
    try {
        console.log('[NODES] Initializing cache...');
        await getNodes(true);
        console.log('[NODES] Cache initialized successfully');
    } catch (err) {
        console.error(chalk.red('[NODES] Failed to initialize cache:'), err);
    }
})();

module.exports = {
    router,
    getNodes,
    getNodeById,
    createNode,
    updateNode,
    deleteNode,
    getNodeAllocations,
    createAllocation,
    deleteAllocation
}; 