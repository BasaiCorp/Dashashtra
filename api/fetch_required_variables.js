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

const VARIABLES_CACHE_FILE = path.join(cacheDir, 'egg_variables.json');
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// Initialize module
console.log('[VARIABLES] Initializing egg variables fetcher module...');

/**
 * Get all variables for a specific egg
 * @param {number} eggId - The ID of the egg
 * @param {boolean} forceUpdate - Force cache update
 * @returns {Promise<Array>} - Array of variable objects
 */
async function getEggVariables(eggId, forceUpdate = false) {
    try {
        // Check if cache exists and is valid
        if (!forceUpdate && fs.existsSync(VARIABLES_CACHE_FILE)) {
            const cacheStats = fs.statSync(VARIABLES_CACHE_FILE);
            const cacheAge = Date.now() - cacheStats.mtimeMs;
            
            // If cache is still valid, use it
            if (cacheAge < CACHE_TTL) {
                const cacheData = JSON.parse(fs.readFileSync(VARIABLES_CACHE_FILE, 'utf8'));
                if (cacheData[eggId]) {
                    console.log(`[VARIABLES] Using cached variables for egg ID ${eggId}`);
                    return cacheData[eggId];
                }
            }
        }
        
        // Load existing cache if it exists
        let variablesCache = {};
        if (fs.existsSync(VARIABLES_CACHE_FILE)) {
            variablesCache = JSON.parse(fs.readFileSync(VARIABLES_CACHE_FILE, 'utf8'));
        }
        
        // Fetch the egg details to find the nest ID
        console.log(`[VARIABLES] Fetching egg ${eggId} details to determine nest ID...`);
        let nestId = 1; // Default to 1 if we can't find it
        
        // Try to get the nest ID from eggs cache first
        const eggsCacheFile = path.join(cacheDir, 'eggs_cache.json');
        if (fs.existsSync(eggsCacheFile)) {
            const eggsCache = JSON.parse(fs.readFileSync(eggsCacheFile, 'utf8'));
            
            // Find the egg with matching ID
            for (const id in eggsCache) {
                const eggs = eggsCache[id];
                for (const egg of eggs) {
                    if (egg.id.toString() === eggId.toString()) {
                        nestId = egg.nest;
                        break;
                    }
                }
                if (nestId !== 1) break; // Found it, no need to continue searching
            }
        }
        
        // Fetch variables for this egg
        console.log(`[VARIABLES] Fetching variables for egg ${eggId} in nest ${nestId}...`);
        const variables = await fetchEggVariables(nestId, eggId);
        
        // Update cache with new variables
        variablesCache[eggId] = variables;
        fs.writeFileSync(VARIABLES_CACHE_FILE, JSON.stringify(variablesCache, null, 2));
        
        return variables;
    } catch (error) {
        console.error(chalk.red(`[VARIABLES] Error getting variables for egg ${eggId}:`), error);
        
        // If cache exists but is outdated, still use it as fallback
        if (fs.existsSync(VARIABLES_CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(VARIABLES_CACHE_FILE, 'utf8'));
            if (cacheData[eggId]) {
                console.log(chalk.yellow(`[VARIABLES] Using outdated cache as fallback for egg ${eggId}`));
                return cacheData[eggId];
            }
        }
        
        // Return an empty array if no cache
        return [];
    }
}

/**
 * Fetch egg variables from Pterodactyl API
 * @param {number} nestId - Nest ID
 * @param {number} eggId - Egg ID
 * @returns {Promise<Array>} - Array of variable objects
 */
async function fetchEggVariables(nestId, eggId) {
    try {
        console.log(`[VARIABLES] Fetching variables for egg ${eggId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}/eggs/${eggId}?include=variables`,
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
            throw new Error(`Failed to fetch egg variables: ${response.status} ${response.statusText}`);
        }
        
        const eggData = await response.json();
        
        // Extract variables from the response
        const variables = eggData.attributes.relationships?.variables?.data || [];
        
        // Format variables for frontend use
        return variables.map(variable => ({
            id: variable.attributes.id,
            name: variable.attributes.name,
            description: variable.attributes.description,
            env_variable: variable.attributes.env_variable,
            default_value: variable.attributes.default_value,
            user_viewable: variable.attributes.user_viewable,
            user_editable: variable.attributes.user_editable,
            rules: variable.attributes.rules
        }));
    } catch (error) {
        console.error(chalk.red(`[VARIABLES] Error fetching variables for egg ${eggId}:`), error);
        throw error;
    }
}

/**
 * Fetch all variables for multiple eggs
 * @param {Array} eggIds - Array of egg IDs
 * @returns {Promise<Object>} - Object with egg IDs as keys and arrays of variable objects as values
 */
async function getAllEggVariables(eggIds) {
    const variables = {};
    for (const eggId of eggIds) {
        variables[eggId] = await getEggVariables(eggId);
    }
    return variables;
}

/**
 * Force update of the variables cache for all eggs
 * @param {Array} eggIds - Array of egg IDs to update
 * @returns {Promise<Object>} - Object with egg IDs as keys and arrays of variable objects as values
 */
async function updateVariablesCache(eggIds) {
    console.log('[VARIABLES] Updating variables cache...');
    
    try {
        const variables = {};
        for (const eggId of eggIds) {
            variables[eggId] = await getEggVariables(eggId, true);
        }
        
        // Save to cache
        fs.writeFileSync(VARIABLES_CACHE_FILE, JSON.stringify(variables, null, 2));
        console.log(`[VARIABLES] Cache updated for ${Object.keys(variables).length} eggs`);
        
        return variables;
    } catch (error) {
        console.error(chalk.red('[VARIABLES] Error updating variables cache:'), error);
        throw error;
    }
}

/**
 * Get required variables for a specific egg
 * @param {number} eggId - The ID of the egg
 * @returns {Promise<Array>} - Array of required variable objects
 */
async function getRequiredVariables(eggId) {
    try {
        const variables = await getEggVariables(eggId);
        
        // Filter out variables that are required based on the rules
        return variables.filter(variable => {
            // Parse rules to check if required
            return variable.rules.includes('required');
        });
    } catch (error) {
        console.error(chalk.red(`[VARIABLES] Error getting required variables for egg ${eggId}:`), error);
        return [];
    }
}

// API route to get variables for an egg
router.get('/egg/:id/variables', async (req, res) => {
    try {
        const eggId = req.params.id;
        const variables = await getEggVariables(eggId);
        
        res.json({ variables });
    } catch (error) {
        console.error(chalk.red('[VARIABLES] Error in API route:'), error);
        res.status(500).json({ error: 'Failed to fetch egg variables' });
    }
});

// API route to get required variables for an egg
router.get('/egg/:id/required-variables', async (req, res) => {
    try {
        const eggId = req.params.id;
        const variables = await getRequiredVariables(eggId);
        
        res.json({ variables });
    } catch (error) {
        console.error(chalk.red('[VARIABLES] Error in API route:'), error);
        res.status(500).json({ error: 'Failed to fetch required egg variables' });
    }
});

// Initialize cache
(async () => {
    try {
        // Check if eggs cache exists and if so, get all egg IDs
        const eggsCacheFile = path.join(cacheDir, 'eggs_cache.json');
        if (fs.existsSync(eggsCacheFile)) {
            const eggsCache = JSON.parse(fs.readFileSync(eggsCacheFile, 'utf8'));
            const eggIds = [];
            
            // Extract all egg IDs from the cache
            for (const nestId in eggsCache) {
                const eggs = eggsCache[nestId];
                eggs.forEach(egg => {
                    eggIds.push(egg.id);
                });
            }
            
            // Initialize variables cache for all eggs
            if (eggIds.length > 0) {
                console.log(`[VARIABLES] Initializing variables cache for ${eggIds.length} eggs...`);
                await getAllEggVariables(eggIds);
            }
        }
    } catch (error) {
        console.error(chalk.red('[VARIABLES] Error initializing variables cache:'), error);
    }
})();

module.exports = {
    getEggVariables,
    getRequiredVariables,
    getAllEggVariables,
    updateVariablesCache,
    router
}; 