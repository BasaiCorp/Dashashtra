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

const NESTS_CACHE_FILE = path.join(cacheDir, 'nests_cache.json');
const EGGS_CACHE_FILE = path.join(cacheDir, 'eggs_cache.json');
const LOCATIONS_CACHE_FILE = path.join(cacheDir, 'locations_cache.json');
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// Initialize module
console.log('[EGGS] Initializing eggs, nests, and locations fetcher module...');

/**
 * Get all locations from Pterodactyl panel
 * @param {boolean} forceUpdate - Force cache update
 * @returns {Promise<Array>} - Array of location objects
 */
async function getLocations(forceUpdate = false) {
    try {
        // Check if cache exists and is valid
        if (!forceUpdate && fs.existsSync(LOCATIONS_CACHE_FILE)) {
            const cacheStats = fs.statSync(LOCATIONS_CACHE_FILE);
            const cacheAge = Date.now() - cacheStats.mtimeMs;
            
            // If cache is still valid, use it
            if (cacheAge < CACHE_TTL) {
                const cacheData = JSON.parse(fs.readFileSync(LOCATIONS_CACHE_FILE, 'utf8'));
                console.log('[EGGS] Using cached location data');
                return cacheData;
            }
        }
        
        // Update cache
        return await updateLocationsCache();
    } catch (error) {
        console.error(chalk.red('[EGGS] Error getting locations:'), error);
        // If cache exists but is outdated, still use it as fallback
        if (fs.existsSync(LOCATIONS_CACHE_FILE)) {
            console.log(chalk.yellow('[EGGS] Using outdated cache as fallback'));
            return JSON.parse(fs.readFileSync(LOCATIONS_CACHE_FILE, 'utf8'));
        }
        return [];
    }
}

/**
 * Get all nests from Pterodactyl panel
 * @param {boolean} forceUpdate - Force cache update
 * @returns {Promise<Array>} - Array of nest objects
 */
async function getNests(forceUpdate = false) {
    try {
        // Check if cache exists and is valid
        if (!forceUpdate && fs.existsSync(NESTS_CACHE_FILE)) {
            const cacheStats = fs.statSync(NESTS_CACHE_FILE);
            const cacheAge = Date.now() - cacheStats.mtimeMs;
            
            // If cache is still valid, use it
            if (cacheAge < CACHE_TTL) {
                const cacheData = JSON.parse(fs.readFileSync(NESTS_CACHE_FILE, 'utf8'));
                console.log('[EGGS] Using cached nest data');
                return cacheData;
            }
        }
        
        // Update cache
        return await updateNestsCache();
    } catch (error) {
        console.error(chalk.red('[EGGS] Error getting nests:'), error);
        // If cache exists but is outdated, still use it as fallback
        if (fs.existsSync(NESTS_CACHE_FILE)) {
            console.log(chalk.yellow('[EGGS] Using outdated cache as fallback'));
            return JSON.parse(fs.readFileSync(NESTS_CACHE_FILE, 'utf8'));
        }
        return [];
    }
}

/**
 * Get all eggs from Pterodactyl panel
 * @param {boolean} forceUpdate - Force cache update
 * @returns {Promise<Object>} - Object with nest IDs as keys and arrays of egg objects as values
 */
async function getEggs(forceUpdate = false) {
    try {
        // Check if cache exists and is valid
        if (!forceUpdate && fs.existsSync(EGGS_CACHE_FILE)) {
            const cacheStats = fs.statSync(EGGS_CACHE_FILE);
            const cacheAge = Date.now() - cacheStats.mtimeMs;
            
            // If cache is still valid, use it
            if (cacheAge < CACHE_TTL) {
                const cacheData = JSON.parse(fs.readFileSync(EGGS_CACHE_FILE, 'utf8'));
                console.log('[EGGS] Using cached egg data');
                return cacheData;
            }
        }
        
        // Update cache
        return await updateEggsCache();
    } catch (error) {
        console.error(chalk.red('[EGGS] Error getting eggs:'), error);
        // If cache exists but is outdated, still use it as fallback
        if (fs.existsSync(EGGS_CACHE_FILE)) {
            console.log(chalk.yellow('[EGGS] Using outdated cache as fallback'));
            return JSON.parse(fs.readFileSync(EGGS_CACHE_FILE, 'utf8'));
        }
        return {};
    }
}

/**
 * Get a single nest by ID
 * @param {number} nestId - Pterodactyl nest ID
 * @returns {Promise<object|null>} - Nest object or null if not found
 */
async function getNestById(nestId) {
    try {
        console.log(`[EGGS] Fetching nest ${nestId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}?include=eggs`,
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
            throw new Error(`Failed to fetch nest: ${response.status} ${response.statusText}`);
        }
        
        const nestData = await response.json();
        return nestData.attributes;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error fetching nest ${nestId}:`), error);
        return null;
    }
}

/**
 * Get a single egg by nest ID and egg ID
 * @param {number} nestId - Pterodactyl nest ID
 * @param {number} eggId - Pterodactyl egg ID
 * @returns {Promise<object|null>} - Egg object or null if not found
 */
async function getEggById(nestId, eggId) {
    try {
        console.log(`[EGGS] Fetching egg ${eggId} from nest ${nestId} from Pterodactyl...`);
        
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
            throw new Error(`Failed to fetch egg: ${response.status} ${response.statusText}`);
        }
        
        const eggData = await response.json();
        return eggData.attributes;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error fetching egg ${eggId} from nest ${nestId}:`), error);
        return null;
    }
}

/**
 * Update the nests cache
 * @returns {Promise<Array>} - Array of nest objects
 */
async function updateNestsCache() {
    console.log('[EGGS] Updating nests cache...');
    
    try {
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests?include=eggs`,
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
            throw new Error(`Failed to fetch nests: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const nests = data.data.map(nest => nest.attributes);
        
        // Save to cache
        fs.writeFileSync(NESTS_CACHE_FILE, JSON.stringify(nests, null, 2));
        console.log(`[EGGS] Cache updated with ${nests.length} nests`);
        
        return nests;
    } catch (error) {
        console.error(chalk.red('[EGGS] Error updating nests cache:'), error);
        throw error;
    }
}

/**
 * Update the eggs cache
 * @returns {Promise<Object>} - Object with nest IDs as keys and arrays of egg objects as values
 */
async function updateEggsCache() {
    console.log('[EGGS] Updating eggs cache...');
    
    try {
        const nests = await getNests(true);
        const eggs = {};
        
        for (const nest of nests) {
            eggs[nest.id] = [];
            
            for (const egg of nest.relationships.eggs.data) {
                const detailedEgg = await getEggById(nest.id, egg.attributes.id);
                eggs[nest.id].push(detailedEgg);
            }
        }
        
        // Save to cache
        fs.writeFileSync(EGGS_CACHE_FILE, JSON.stringify(eggs, null, 2));
        console.log(`[EGGS] Cache updated with eggs for ${Object.keys(eggs).length} nests`);
        
        return eggs;
    } catch (error) {
        console.error(chalk.red('[EGGS] Error updating eggs cache:'), error);
        throw error;
    }
}

/**
 * Create a new nest
 * @param {object} nestData - Nest data to create
 * @returns {Promise<object>} - Created nest object
 */
async function createNest(nestData) {
    try {
        console.log('[EGGS] Creating new nest in Pterodactyl...');
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(nestData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create nest: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateNestsCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red('[EGGS] Error creating nest:'), error);
        throw error;
    }
}

/**
 * Update a nest
 * @param {number} nestId - Pterodactyl nest ID
 * @param {object} nestData - Nest data to update
 * @returns {Promise<object>} - Updated nest object
 */
async function updateNest(nestId, nestData) {
    try {
        console.log(`[EGGS] Updating nest ${nestId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}`,
            {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(nestData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update nest: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateNestsCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error updating nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Delete a nest
 * @param {number} nestId - Pterodactyl nest ID
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteNest(nestId) {
    try {
        console.log(`[EGGS] Deleting nest ${nestId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}`,
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
            throw new Error(`Failed to delete nest: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateNestsCache();
        await updateEggsCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error deleting nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Create a new egg
 * @param {number} nestId - Pterodactyl nest ID
 * @param {object} eggData - Egg data to create
 * @returns {Promise<object>} - Created egg object
 */
async function createEgg(nestId, eggData) {
    try {
        console.log(`[EGGS] Creating new egg in nest ${nestId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}/eggs`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(eggData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create egg: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateEggsCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error creating egg in nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Update an egg
 * @param {number} nestId - Pterodactyl nest ID
 * @param {number} eggId - Pterodactyl egg ID
 * @param {object} eggData - Egg data to update
 * @returns {Promise<object>} - Updated egg object
 */
async function updateEgg(nestId, eggId, eggData) {
    try {
        console.log(`[EGGS] Updating egg ${eggId} in nest ${nestId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}/eggs/${eggId}`,
            {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(eggData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update egg: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateEggsCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error updating egg ${eggId} in nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Delete an egg
 * @param {number} nestId - Pterodactyl nest ID
 * @param {number} eggId - Pterodactyl egg ID
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteEgg(nestId, eggId) {
    try {
        console.log(`[EGGS] Deleting egg ${eggId} from nest ${nestId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}/eggs/${eggId}`,
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
            throw new Error(`Failed to delete egg: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateEggsCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error deleting egg ${eggId} from nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Get variables for an egg
 * @param {number} nestId - Pterodactyl nest ID
 * @param {number} eggId - Pterodactyl egg ID
 * @returns {Promise<Array>} - Array of variable objects
 */
async function getEggVariables(nestId, eggId) {
    try {
        console.log(`[EGGS] Fetching variables for egg ${eggId} in nest ${nestId} from Pterodactyl...`);
        
        const egg = await getEggById(nestId, eggId);
        if (!egg) {
            throw new Error(`Egg ${eggId} in nest ${nestId} not found`);
        }
        
        return egg.relationships.variables.data.map(variable => variable.attributes);
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error fetching variables for egg ${eggId} in nest ${nestId}:`), error);
        return [];
    }
}

/**
 * Create a new variable for an egg
 * @param {number} nestId - Pterodactyl nest ID
 * @param {number} eggId - Pterodactyl egg ID
 * @param {object} variableData - Variable data to create
 * @returns {Promise<object>} - Created variable object
 */
async function createEggVariable(nestId, eggId, variableData) {
    try {
        console.log(`[EGGS] Creating new variable for egg ${eggId} in nest ${nestId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}/eggs/${eggId}/variables`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(variableData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create variable: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateEggsCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error creating variable for egg ${eggId} in nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Update a variable for an egg
 * @param {number} nestId - Pterodactyl nest ID
 * @param {number} eggId - Pterodactyl egg ID
 * @param {number} variableId - Pterodactyl variable ID
 * @param {object} variableData - Variable data to update
 * @returns {Promise<object>} - Updated variable object
 */
async function updateEggVariable(nestId, eggId, variableId, variableData) {
    try {
        console.log(`[EGGS] Updating variable ${variableId} for egg ${eggId} in nest ${nestId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}/eggs/${eggId}/variables/${variableId}`,
            {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(variableData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update variable: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateEggsCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error updating variable ${variableId} for egg ${eggId} in nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Delete a variable from an egg
 * @param {number} nestId - Pterodactyl nest ID
 * @param {number} eggId - Pterodactyl egg ID
 * @param {number} variableId - Pterodactyl variable ID
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteEggVariable(nestId, eggId, variableId) {
    try {
        console.log(`[EGGS] Deleting variable ${variableId} from egg ${eggId} in nest ${nestId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/nests/${nestId}/eggs/${eggId}/variables/${variableId}`,
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
            throw new Error(`Failed to delete variable: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateEggsCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error deleting variable ${variableId} from egg ${eggId} in nest ${nestId}:`), error);
        throw error;
    }
}

/**
 * Format eggs data for client-side use
 * @returns {Promise<Object>} - Object with categories and eggs for client use
 */
async function formatEggsForClient() {
    try {
        const nests = await getNests();
        const eggs = await getEggs();
        
        const formattedData = {};
        
        for (const nest of nests) {
            // Use nest name as category
            const category = nest.name;
            formattedData[category] = {};
            
            // Add eggs to category
            if (eggs[nest.id]) {
                for (const egg of eggs[nest.id]) {
                    formattedData[category][egg.id] = {
                        id: egg.id,
                        name: egg.name,
                        description: egg.description,
                        nest: nest.id,
                        egg: egg.id,
                        docker_image: egg.docker_image,
                        startup: egg.startup,
                        minimum: {
                            disk: 1024,
                            memory: 512,
                            cpu: 50
                        }
                    };
                }
            }
        }
        
        return formattedData;
    } catch (error) {
        console.error(chalk.red('[EGGS] Error formatting eggs for client:'), error);
        
        // Return a minimal default structure
        return {
            "Minecraft": {
                "1": {
                    id: 1,
                    name: "Paper",
                    description: "Paper Minecraft server",
                    nest: 1,
                    egg: 1,
                    minimum: {
                        disk: 1024,
                        memory: 512,
                        cpu: 50
                    }
                },
                "2": {
                    id: 2,
                    name: "BungeeCord",
                    description: "BungeeCord proxy server",
                    nest: 1,
                    egg: 2,
                    minimum: {
                        disk: 512,
                        memory: 256,
                        cpu: 50
                    }
                }
            }
        };
    }
}

/**
 * Update the locations cache
 * @returns {Promise<Array>} - Array of location objects
 */
async function updateLocationsCache() {
    console.log('[EGGS] Updating locations cache...');
    
    try {
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/locations`,
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
            throw new Error(`Failed to fetch locations: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const locations = data.data.map(location => ({
            id: location.attributes.id,
            short: location.attributes.short,
            long: location.attributes.long,
            description: location.attributes.description
        }));
        
        // Save to cache
        fs.writeFileSync(LOCATIONS_CACHE_FILE, JSON.stringify(locations, null, 2));
        console.log(`[EGGS] Cache updated with ${locations.length} locations`);
        
        return locations;
    } catch (error) {
        console.error(chalk.red('[EGGS] Error updating locations cache:'), error);
        throw error;
    }
}

/**
 * Get a single location by ID
 * @param {number} locationId - Pterodactyl location ID
 * @returns {Promise<object|null>} - Location object or null if not found
 */
async function getLocationById(locationId) {
    try {
        console.log(`[EGGS] Fetching location ${locationId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/locations/${locationId}`,
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
            throw new Error(`Failed to fetch location: ${response.status} ${response.statusText}`);
        }
        
        const locationData = await response.json();
        return {
            id: locationData.attributes.id,
            short: locationData.attributes.short,
            long: locationData.attributes.long,
            description: locationData.attributes.description
        };
    } catch (error) {
        console.error(chalk.red(`[EGGS] Error fetching location ${locationId}:`), error);
        return null;
    }
}

// Add API routes for admin panel
router.get('/admin/eggs', async (req, res) => {
    try {
        const nests = await getNests(true);
        const eggs = await getEggs(true);
        const locations = await getLocations(true);
        res.json({ nests, eggs, locations });
    } catch (error) {
        console.error(chalk.red('[EGGS] Error fetching data for admin:'), error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Initialize by warming up cache
(async () => {
    try {
        console.log('[EGGS] Initializing cache...');
        await getNests(true);
        await getEggs(true);
        await getLocations(true);
        console.log('[EGGS] Cache initialized successfully');
    } catch (err) {
        console.error(chalk.red('[EGGS] Failed to initialize cache:'), err);
    }
})();

module.exports = {
    router,
    getNests,
    getEggs,
    getNestById,
    getEggById,
    createNest,
    updateNest,
    deleteNest,
    createEgg,
    updateEgg,
    deleteEgg,
    getEggVariables,
    createEggVariable,
    updateEggVariable,
    deleteEggVariable,
    formatEggsForClient,
    updateNestsCache,
    updateEggsCache,
    getLocations,
    getLocationById
};