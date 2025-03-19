const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settings = require('../../settings.json');
const utils = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('Shows your servers and their status'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get the main application and database
            const indexjs = require('../../index.js');
            const db = indexjs.db;
            
            // Get Discord ID from the interaction
            const discordId = interaction.user.id;
            
            // Find user with matching Discord ID
            const user = await db.users.getUserByDiscordId(discordId);
            
            if (!user) {
                const errorEmbed = utils.createErrorEmbed(
                    'Account Not Found',
                    `You're not linked to any account on ${settings.website.name}. Please login with Discord on our dashboard to link your account.`,
                    interaction.user
                );
                
                // Create button to dashboard
                const dashboardButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Login with Discord')
                            .setStyle(ButtonStyle.Link)
                            .setURL(settings.website.url)
                    );
                
                return interaction.editReply({ 
                    embeds: [errorEmbed],
                    components: [dashboardButton],
                    ephemeral: true 
                });
            }
            
            // Get user's package info
            const package = await db.packages.getUserPackage(user.id);
            const packageName = package ? package.name : settings.api.client.packages.default;
            
            // Check if user has a Pterodactyl account
            if (!user.pterodactyl_id) {
                const errorEmbed = utils.createErrorEmbed(
                    'No Servers Found',
                    `You don't have any servers on ${settings.website.name}. Visit the dashboard to create your first server.`,
                    interaction.user
                );
                
                // Create button to dashboard create
                const createButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Dashboard')
                            .setStyle(ButtonStyle.Link)
                            .setURL(settings.website.url),
                        new ButtonBuilder()
                            .setLabel('Create Server')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`${settings.website.url}/create`)
                    );
                
                return interaction.editReply({ 
                    embeds: [errorEmbed],
                    components: [createButton],
                    ephemeral: true 
                });
            }
            
            // Get user's servers
            const pterodactylUser = await db.pterodactyl.getUserById(user.pterodactyl_id);
            
            if (!pterodactylUser || !pterodactylUser.relationships || 
                !pterodactylUser.relationships.servers || 
                !pterodactylUser.relationships.servers.data || 
                pterodactylUser.relationships.servers.data.length === 0) {
                
                const errorEmbed = utils.createErrorEmbed(
                    'No Servers Found',
                    `You don't have any servers on ${settings.website.name}. Visit the dashboard to create your first server.`,
                    interaction.user
                );
                
                // Create button to dashboard create
                const createButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Dashboard')
                            .setStyle(ButtonStyle.Link)
                            .setURL(settings.website.url),
                        new ButtonBuilder()
                            .setLabel('Create Server')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`${settings.website.url}/create`)
                    );
                
                return interaction.editReply({ 
                    embeds: [errorEmbed],
                    components: [createButton],
                    ephemeral: true 
                });
            }
            
            const servers = pterodactylUser.relationships.servers.data;
            
            // Function to get status emoji
            const getStatusEmoji = (server) => {
                if (!server.attributes || !server.attributes.status) return '❓';
                
                switch (server.attributes.status) {
                    case 'running':
                        return '🟢';
                    case 'starting':
                    case 'stopping':
                        return '🟠';
                    case 'offline':
                        return '🔴';
                    case 'suspended':
                        return '⛔';
                    default:
                        return '❓';
                }
            };
            
            // Function to format server resources
            const formatResources = (server) => {
                if (!server.attributes || !server.attributes.limits) {
                    return 'Unknown';
                }
                
                const limits = server.attributes.limits;
                let resources = [];
                
                if (limits.memory) resources.push(`RAM: ${limits.memory}MB`);
                if (limits.disk) resources.push(`Disk: ${limits.disk}MB`);
                if (limits.cpu) resources.push(`CPU: ${limits.cpu}%`);
                
                return resources.join(' | ');
            };
            
            // Create server list with status indicators and details
            const serverList = servers.map((server, index) => {
                const statusEmoji = getStatusEmoji(server);
                const resources = formatResources(server);
                const serverName = server.attributes.name || `Server #${index + 1}`;
                const serverID = server.attributes.identifier || 'Unknown ID';
                
                return `${statusEmoji} **${serverName}**\n` +
                       `ID: \`${serverID}\`\n` +
                       `Resources: ${resources}\n` +
                       `[Manage](${settings.pterodactyl.domain}/server/${serverID})\n`;
            }).join('\n');
            
            // Create servers embed
            const serversEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`${user.username || user.email.split('@')[0]}'s Servers`)
                .setDescription(`You have ${servers.length} server${servers.length !== 1 ? 's' : ''} on ${settings.website.name}`)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '🏷️ Package', value: packageName, inline: true },
                    { name: '🖥️ Servers', value: `${servers.length}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: 'Your Servers', value: serverList, inline: false },
                    utils.createDashboardLinks()
                )
                .setFooter(utils.createFooter('Server List', interaction.user))
                .setTimestamp();
            
            // Create buttons for dashboard and refresh
            const row = new ActionRowBuilder()
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
                        .setCustomId('refresh_servers')
                        .setLabel('Refresh')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );
            
            const response = await interaction.editReply({
                embeds: [serversEmbed],
                components: [row],
                ephemeral: true,
                fetchReply: true
            });
            
            // Create a collector for button interactions
            const collector = response.createMessageComponentCollector({ 
                time: 60000 // 60 seconds
            });
            
            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'This button is not for you!', ephemeral: true });
                }
                
                if (i.customId === 'refresh_servers') {
                    // Re-fetch all data for refresh
                    const refreshedUser = await db.users.getUserByDiscordId(discordId);
                    const refreshedPterodactylUser = await db.pterodactyl.getUserById(refreshedUser.pterodactyl_id);
                    
                    if (!refreshedPterodactylUser || !refreshedPterodactylUser.relationships || 
                        !refreshedPterodactylUser.relationships.servers || 
                        !refreshedPterodactylUser.relationships.servers.data) {
                        
                        return i.update({ 
                            content: 'No servers found or an error occurred while refreshing.',
                            embeds: [],
                            components: []
                        });
                    }
                    
                    const refreshedServers = refreshedPterodactylUser.relationships.servers.data;
                    
                    // Create refreshed server list
                    const refreshedServerList = refreshedServers.map((server, index) => {
                        const statusEmoji = getStatusEmoji(server);
                        const resources = formatResources(server);
                        const serverName = server.attributes.name || `Server #${index + 1}`;
                        const serverID = server.attributes.identifier || 'Unknown ID';
                        
                        return `${statusEmoji} **${serverName}**\n` +
                               `ID: \`${serverID}\`\n` +
                               `Resources: ${resources}\n` +
                               `[Manage](${settings.pterodactyl.domain}/server/${serverID})\n`;
                    }).join('\n');
                    
                    // Update embed with refreshed data
                    const updatedEmbed = EmbedBuilder.from(serversEmbed)
                        .setDescription(`You have ${refreshedServers.length} server${refreshedServers.length !== 1 ? 's' : ''} on ${settings.website.name}`)
                        .setFields(
                            { name: '🏷️ Package', value: packageName, inline: true },
                            { name: '🖥️ Servers', value: `${refreshedServers.length}`, inline: true },
                            { name: '\u200B', value: '\u200B', inline: true },
                            { name: 'Your Servers', value: refreshedServerList, inline: false },
                            utils.createDashboardLinks()
                        )
                        .setTimestamp();
                    
                    await i.update({ embeds: [updatedEmbed], components: [row] });
                }
            });
            
            collector.on('end', () => {
                // Disable buttons when collector expires
                const disabledRow = new ActionRowBuilder()
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
                            .setCustomId('refresh_servers')
                            .setLabel('Refresh')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🔄')
                            .setDisabled(true)
                    );
                
                interaction.editReply({ 
                    embeds: [serversEmbed], 
                    components: [disabledRow] 
                }).catch(console.error);
            });
            
        } catch (error) {
            console.error('Error in servers command:', error);
            const errorEmbed = utils.createErrorEmbed(
                'Error',
                'An error occurred while fetching your servers.',
                interaction.user
            );
            
            await interaction.editReply({ 
                embeds: [errorEmbed],
                ephemeral: true 
            });
        }
    },
}; 