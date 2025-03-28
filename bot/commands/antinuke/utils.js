const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const settings = require('../../../settings.json');

// Path to store antinuke configuration
const configPath = path.join(__dirname, '../../../data/antinuke');

// Ensure the directory exists
if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath, { recursive: true });
}

/**
 * Get the antinuke configuration for a guild
 * @param {string} guildId The guild ID
 * @returns {object} The antinuke configuration
 */
function getConfig(guildId) {
    const configFile = path.join(configPath, `${guildId}.json`);
    
    if (!fs.existsSync(configFile)) {
        // Default configuration
        const defaultConfig = {
            enabled: false,
            whitelist: [],
            extraOwners: [],
            punishment: 'ban', // Options: ban, kick, strip
            logs: null, // Channel ID for logs
            protections: {
                massban: true,
                webhookCreate: true,
                channelDelete: true,
                channelCreate: true,
                roleDelete: true,
                roleCreate: true,
                botAdd: true,
                memberAdmin: true
            },
            thresholds: {
                massban: 3, // Number of bans in quick succession to trigger
                timeWindow: 10000 // Time window in ms (10 seconds)
            }
        };
        
        // Save default config
        fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        return config;
    } catch (error) {
        console.error(`Error reading antinuke config for guild ${guildId}:`, error);
        return null;
    }
}

/**
 * Save the antinuke configuration for a guild
 * @param {string} guildId The guild ID
 * @param {object} config The antinuke configuration
 * @returns {boolean} Whether the save was successful
 */
function saveConfig(guildId, config) {
    const configFile = path.join(configPath, `${guildId}.json`);
    
    try {
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving antinuke config for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Check if a user is authorized to modify antinuke settings
 * @param {object} guild The guild object
 * @param {object} user The user object
 * @param {object} config The antinuke configuration
 * @returns {boolean} Whether the user is authorized
 */
function isAuthorized(guild, user, config) {
    // Server owner is always authorized
    if (guild.ownerId === user.id) return true;
    
    // Extra owners are authorized
    if (config.extraOwners.includes(user.id)) return true;
    
    return false;
}

/**
 * Check if a user is whitelisted in the antinuke system
 * @param {string} userId The user ID
 * @param {object} config The antinuke configuration
 * @returns {boolean} Whether the user is whitelisted
 */
function isWhitelisted(userId, config) {
    // Check if user is in the whitelist
    return config.whitelist.includes(userId);
}

/**
 * Create a standard antinuke embed
 * @param {string} title The embed title
 * @param {string} description The embed description
 * @param {string} color The embed color (hex)
 * @returns {EmbedBuilder} The created embed
 */
function createEmbed(title, description, color = '#00FF00') {
    return new EmbedBuilder()
        .setTitle(`🛡️ ${title}`)
        .setDescription(description)
        .setColor(color)
        .setFooter({ 
            text: settings.website.name + ' | AntiNuke System', 
            iconURL: settings.website.favicon 
        })
        .setTimestamp();
}

/**
 * Log an antinuke event to the configured log channel
 * @param {object} guild The guild object
 * @param {object} config The antinuke configuration
 * @param {string} title The log title
 * @param {string} description The log description
 * @param {string} color The log color (hex)
 */
async function logEvent(guild, config, title, description, color = '#FF0000') {
    if (!config.logs) return;
    
    try {
        const logChannel = await guild.channels.fetch(config.logs);
        if (!logChannel) return;
        
        const embed = createEmbed(title, description, color);
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Error logging antinuke event in guild ${guild.id}:`, error);
    }
}

/**
 * Apply punishment to a user based on the configured punishment type
 * @param {object} guild The guild object
 * @param {object} member The member to punish
 * @param {object} config The antinuke configuration
 * @param {string} reason The reason for the punishment
 */
async function applyPunishment(guild, member, config, reason) {
    try {
        switch (config.punishment) {
            case 'ban':
                await member.ban({ reason: `[AntiNuke] ${reason}` });
                break;
            case 'kick':
                await member.kick(`[AntiNuke] ${reason}`);
                break;
            case 'strip':
                // Remove all roles with administrative permissions
                const adminRoles = member.roles.cache.filter(role => 
                    role.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    role.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                    role.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
                    role.permissions.has(PermissionsBitField.Flags.ManageChannels)
                );
                
                for (const [_, role] of adminRoles) {
                    await member.roles.remove(role, `[AntiNuke] ${reason}`);
                }
                break;
        }
    } catch (error) {
        console.error(`Error applying punishment in guild ${guild.id}:`, error);
    }
}

module.exports = {
    getConfig,
    saveConfig,
    isAuthorized,
    isWhitelisted,
    createEmbed,
    logEvent,
    applyPunishment
};
