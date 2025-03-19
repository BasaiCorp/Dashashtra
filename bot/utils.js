const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const settings = require('../settings.json');

/**
 * Creates a standard footer for embeds
 * @param {string} text Additional text to add to the footer
 * @param {object} user Discord user object (optional)
 * @returns {object} Footer object for embeds
 */
function createFooter(text = '', user = null) {
    const userText = user ? `Requested by ${user.tag} • ` : '';
    return { 
        text: `${userText}${settings.website.name} ${text ? '• ' + text : ''}`, 
        iconURL: settings.website.favicon 
    };
}

/**
 * Creates standard dashboard links to add to embeds
 * @returns {object} Field object for embeds
 */
function createDashboardLinks() {
    return {
        name: '\u200B', // Empty field for spacing
        value: `[Dashboard](${settings.website.url}) | [Panel](${settings.pterodactyl.domain}) | [Support](https://discord.gg/${settings.api.client.bot.guildId || settings.discord.guild_id})`,
        inline: false
    };
}

/**
 * Formats uptime in days, hours, minutes, seconds
 * @param {number} ms Milliseconds
 * @returns {string} Formatted time string
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

/**
 * Creates a standard error embed
 * @param {string} title Error title
 * @param {string} description Error description
 * @param {object} user Discord user object
 * @returns {EmbedBuilder} Error embed
 */
function createErrorEmbed(title, description, user) {
    return new EmbedBuilder()
        .setColor(0xFF5555) // Red
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setFooter(createFooter('Error', user))
        .setTimestamp();
}

/**
 * Creates standard dashboard buttons
 * @param {boolean} disabled Whether to disable non-link buttons
 * @returns {ActionRowBuilder} Action row with dashboard buttons
 */
function createDashboardButtons(disabled = false) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Dashboard')
                .setStyle(ButtonStyle.Link)
                .setURL(settings.website.url),
            new ButtonBuilder()
                .setLabel('Panel')
                .setStyle(ButtonStyle.Link)
                .setURL(settings.pterodactyl.domain),
            new ButtonBuilder()
                .setCustomId('dashboard_link')
                .setLabel('Get Link')
                .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji('🔗')
                .setDisabled(disabled)
        );
}

module.exports = {
    createFooter,
    createDashboardLinks,
    formatUptime,
    createErrorEmbed,
    createDashboardButtons
}; 