const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Get all environment variables for a specific egg
 * @param {number|string} eggId - The ID of the egg
 * @returns {Object} - Object containing egg info and environment variables
 */
function getEggInfo(eggId) {
    try {
        // First try to read from eggs.json cache
        const eggCachePath = path.join(__dirname, '../cache/eggs.json');
        const eggCache = JSON.parse(fs.readFileSync(eggCachePath, 'utf8'));
        
        if (eggCache[eggId]) {
            console.log(`[EGG HANDLER] Found egg ${eggId} in eggs.json cache`);
            return {
                nestId: eggCache[eggId].nestId || 1,
                name: eggCache[eggId].name || 'Unknown',
                description: eggCache[eggId].description || '',
                docker_image: eggCache[eggId].docker_image || 'ghcr.io/pterodactyl/yolks:java_17',
                startup: eggCache[eggId].startup || '',
                environment: generateEnvironmentVariables(eggCache[eggId].variables),
                feature_limits: {
                    databases: 1,
                    backups: 1,
                    allocations: 1
                }
            };
        }
        
        // If not found in eggs.json, try eggs_cache.json
        const eggsCachePath = path.join(__dirname, '../cache/eggs_cache.json');
        const eggsCache = JSON.parse(fs.readFileSync(eggsCachePath, 'utf8'));
        
        // Find the egg with matching ID
        for (const id in eggsCache) {
            const eggs = eggsCache[id];
            for (const egg of eggs) {
                if (egg.id.toString() === eggId.toString()) {
                    console.log(`[EGG HANDLER] Found egg ${eggId} in eggs_cache.json`);
                    
                    // Get environment variables from relationships.variables
                    const variables = {};
                    if (egg.relationships && egg.relationships.variables && 
                        egg.relationships.variables.data) {
                        egg.relationships.variables.data.forEach(variable => {
                            variables[variable.attributes.env_variable] = variable.attributes.default_value;
                        });
                    }
                    
                    return {
                        nestId: egg.nest || 1,
                        name: egg.name || 'Unknown',
                        description: egg.description || '',
                        docker_image: egg.docker_image || 'ghcr.io/pterodactyl/yolks:java_17',
                        startup: egg.startup || '',
                        environment: variables,
                        feature_limits: {
                            databases: 1,
                            backups: 1,
                            allocations: 1
                        }
                    };
                }
            }
        }
        
        // If still not found, log error and return default values
        console.error(`[EGG HANDLER] Egg ${eggId} not found in any cache file`);
        return getDefaultEggInfo();
    } catch (error) {
        console.error(`[EGG HANDLER] Error getting egg info: ${error.message}`);
        return getDefaultEggInfo();
    }
}

/**
 * Generate environment variables object from variables array
 * @param {Array} variables - Array of variable objects
 * @returns {Object} - Object with env_variable as key and default_value as value
 */
function generateEnvironmentVariables(variables) {
    if (!variables || !Array.isArray(variables)) {
        return { SERVER_JARFILE: 'server.jar' };
    }
    
    const environment = {};
    variables.forEach(variable => {
        environment[variable.env_variable] = variable.default_value;
    });
    
    return environment;
}

/**
 * Get default egg info as fallback
 * @returns {Object} - Default egg info
 */
function getDefaultEggInfo() {
    return {
        nestId: 1, // Default to Minecraft
        name: 'Unknown',
        description: 'Default configuration',
        docker_image: 'ghcr.io/pterodactyl/yolks:java_17',
        startup: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}',
        environment: {
            SERVER_JARFILE: 'server.jar',
            MINECRAFT_VERSION: 'latest'
        },
        feature_limits: {
            databases: 1,
            backups: 1,
            allocations: 1
        }
    };
}

/**
 * Create server data payload for Pterodactyl API
 * @param {Object} options - Server creation options
 * @returns {Object} - Server data payload for Pterodactyl API
 */
function createServerData(options) {
    const {
        name,
        userId,
        eggId,
        ram,
        disk,
        cpu,
        port = 1,
        database = 0,
        backup = 0,
        allocation = 0,
        location,
        additionalEnvironment = {}
    } = options;
    
    // Get egg info
    const eggInfo = getEggInfo(eggId);
    
    // Merge additional environment variables with egg defaults
    const environment = {
        ...eggInfo.environment,
        ...additionalEnvironment
    };
    
    // Create server data object
    const serverData = {
        name: name,
        user: userId,
        egg: eggId,
        docker_image: eggInfo.docker_image,
        startup: eggInfo.startup,
        environment: environment,
        limits: {
            memory: ram,
            swap: 0,
            disk: disk,
            io: 500,
            cpu: cpu
        },
        feature_limits: {
            databases: database,
            backups: backup,
            allocations: allocation
        },
        allocation: {
            default: 0
        }
    };
    
    // Add location if provided
    if (location && location !== "0") {
        serverData.deploy = {
            locations: [parseInt(location)],
            dedicated_ip: false,
            port_range: []
        };
    }
    
    return serverData;
}

/**
 * Get specific egg variable values
 * @param {number|string} eggId - The ID of the egg
 * @param {Object} formData - Form data from user 
 * @returns {Object} - Environment variables for the egg
 */
function getEggVariables(eggId, formData) {
    // Get egg info
    const eggInfo = getEggInfo(eggId);
    const environment = {...eggInfo.environment};
    
    // Handle specific egg types
    switch (eggId.toString()) {
        // Vanilla Minecraft (5)
        case '5':
            if (formData.vanilla_version) {
                environment.VANILLA_VERSION = formData.vanilla_version;
            }
            break;
            
        // SpongeVanilla (4)
        case '4':
            if (formData.sponge_version) {
                environment.SPONGE_VERSION = formData.sponge_version || '1.12.2-7.3.0';
            }
            break;
            
        // Paper (2)
        case '2':
            if (formData.minecraft_version) {
                environment.MINECRAFT_VERSION = formData.minecraft_version || 'latest';
            }
            if (formData.build_number) {
                environment.BUILD_NUMBER = formData.build_number || 'latest';
            }
            break;
            
        // Source Engine games
        case '6':
        case '7':
        case '8':
            if (formData.srcds_map) {
                environment.SRCDS_MAP = formData.srcds_map;
            }
            if (formData.steam_acc) {
                environment.STEAM_ACC = formData.steam_acc;
            }
            break;
    }
    
    // Always include server jarfile
    if (formData.server_jarfile) {
        environment.SERVER_JARFILE = formData.server_jarfile;
    }
    
    return environment;
}

module.exports = {
    getEggInfo,
    createServerData,
    getEggVariables
}; 