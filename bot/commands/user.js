const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settings = require('../../settings.json');
const utils = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Shows your user account information'),
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
            const packageData = settings.api.client.packages.list[packageName];
            
            // Get user's resources usage
            let resources = {
                ram: { used: 0, total: packageData.ram },
                disk: { used: 0, total: packageData.disk },
                cpu: { used: 0, total: packageData.cpu },
                servers: { used: 0, total: packageData.servers }
            };
            
            // Calculate resource usage if pterodactyl data is available
            if (user.pterodactyl_id) {
                try {
                    const pterodactylUser = await db.pterodactyl.getUserById(user.pterodactyl_id);
                    
                    if (pterodactylUser && pterodactylUser.relationships && 
                        pterodactylUser.relationships.servers && 
                        pterodactylUser.relationships.servers.data) {
                        
                        const servers = pterodactylUser.relationships.servers.data;
                        resources.servers.used = servers.length;
                        
                        // Sum up resources
                        for (const server of servers) {
                            if (server.attributes && server.attributes.limits) {
                                resources.ram.used += server.attributes.limits.memory || 0;
                                resources.disk.used += server.attributes.limits.disk || 0;
                                resources.cpu.used += server.attributes.limits.cpu || 0;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error fetching pterodactyl user data:', error);
                }
            }
            
            // Calculate percentages
            const ramPercent = Math.min(100, Math.round((resources.ram.used / resources.ram.total) * 100)) || 0;
            const diskPercent = Math.min(100, Math.round((resources.disk.used / resources.disk.total) * 100)) || 0;
            const cpuPercent = Math.min(100, Math.round((resources.cpu.used / resources.cpu.total) * 100)) || 0;
            const serversPercent = Math.min(100, Math.round((resources.servers.used / resources.servers.total) * 100)) || 0;
            
            // Create progress bars
            const createProgressBar = (percent) => {
                const filled = Math.floor(percent / 10);
                const empty = 10 - filled;
                return '█'.repeat(filled) + '▒'.repeat(empty) + ` ${percent}%`;
            };
            
            // Create user profile embed
            const userEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`${user.username || user.email.split('@')[0]}'s Profile`)
                .setDescription(`Account information for ${user.username || user.email}`)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '📧 Email', value: user.email, inline: true },
                    { name: '🏷️ Package', value: packageName, inline: true },
                    { name: '📅 Registered', value: `<t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:R>`, inline: true },
                    { name: '\u200B', value: '**Resource Usage**', inline: false },
                    { name: '🧠 RAM', value: `${createProgressBar(ramPercent)}\n${resources.ram.used}MB / ${resources.ram.total}MB`, inline: true },
                    { name: '💾 Disk', value: `${createProgressBar(diskPercent)}\n${resources.disk.used}MB / ${resources.disk.total}MB`, inline: true },
                    { name: '⚙️ CPU', value: `${createProgressBar(cpuPercent)}\n${resources.cpu.used}% / ${resources.cpu.total}%`, inline: true },
                    { name: '🖥️ Servers', value: `${createProgressBar(serversPercent)}\n${resources.servers.used} / ${resources.servers.total}`, inline: false },
                    utils.createDashboardLinks()
                )
                .setFooter(utils.createFooter('User Info', interaction.user))
                .setTimestamp();
            
            // Create buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(settings.website.url),
                    new ButtonBuilder()
                        .setLabel('Create Server')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`${settings.website.url}/create`),
                    new ButtonBuilder()
                        .setCustomId('refresh_user')
                        .setLabel('Refresh')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );
            
            const response = await interaction.editReply({
                embeds: [userEmbed],
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
                
                if (i.customId === 'refresh_user') {
                    // Re-fetch all data for refresh
                    const refreshedUser = await db.users.getUserByDiscordId(discordId);
                    
                    if (!refreshedUser) {
                        return i.update({ 
                            content: 'Your account seems to have been deleted or unlinked.',
                            embeds: [],
                            components: []
                        });
                    }
                    
                    // Reset resource usage
                    resources = {
                        ram: { used: 0, total: packageData.ram },
                        disk: { used: 0, total: packageData.disk },
                        cpu: { used: 0, total: packageData.cpu },
                        servers: { used: 0, total: packageData.servers }
                    };
                    
                    // Re-calculate resource usage
                    if (refreshedUser.pterodactyl_id) {
                        try {
                            const pterodactylUser = await db.pterodactyl.getUserById(refreshedUser.pterodactyl_id);
                            
                            if (pterodactylUser && pterodactylUser.relationships && 
                                pterodactylUser.relationships.servers && 
                                pterodactylUser.relationships.servers.data) {
                                
                                const servers = pterodactylUser.relationships.servers.data;
                                resources.servers.used = servers.length;
                                
                                // Sum up resources
                                for (const server of servers) {
                                    if (server.attributes && server.attributes.limits) {
                                        resources.ram.used += server.attributes.limits.memory || 0;
                                        resources.disk.used += server.attributes.limits.disk || 0;
                                        resources.cpu.used += server.attributes.limits.cpu || 0;
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error fetching pterodactyl user data:', error);
                        }
                    }
                    
                    // Recalculate percentages
                    const newRamPercent = Math.min(100, Math.round((resources.ram.used / resources.ram.total) * 100)) || 0;
                    const newDiskPercent = Math.min(100, Math.round((resources.disk.used / resources.disk.total) * 100)) || 0;
                    const newCpuPercent = Math.min(100, Math.round((resources.cpu.used / resources.cpu.total) * 100)) || 0;
                    const newServersPercent = Math.min(100, Math.round((resources.servers.used / resources.servers.total) * 100)) || 0;
                    
                    // Update embed
                    const updatedEmbed = EmbedBuilder.from(userEmbed)
                        .setTimestamp()
                        .setFields(
                            { name: '📧 Email', value: refreshedUser.email, inline: true },
                            { name: '🏷️ Package', value: packageName, inline: true },
                            { name: '📅 Registered', value: `<t:${Math.floor(new Date(refreshedUser.created_at).getTime() / 1000)}:R>`, inline: true },
                            { name: '\u200B', value: '**Resource Usage**', inline: false },
                            { name: '🧠 RAM', value: `${createProgressBar(newRamPercent)}\n${resources.ram.used}MB / ${resources.ram.total}MB`, inline: true },
                            { name: '💾 Disk', value: `${createProgressBar(newDiskPercent)}\n${resources.disk.used}MB / ${resources.disk.total}MB`, inline: true },
                            { name: '⚙️ CPU', value: `${createProgressBar(newCpuPercent)}\n${resources.cpu.used}% / ${resources.cpu.total}%`, inline: true },
                            { name: '🖥️ Servers', value: `${createProgressBar(newServersPercent)}\n${resources.servers.used} / ${resources.servers.total}`, inline: false },
                            utils.createDashboardLinks()
                        );
                    
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
                            .setLabel('Create Server')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`${settings.website.url}/create`),
                        new ButtonBuilder()
                            .setCustomId('refresh_user')
                            .setLabel('Refresh')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🔄')
                            .setDisabled(true)
                    );
                
                interaction.editReply({ 
                    embeds: [userEmbed], 
                    components: [disabledRow] 
                }).catch(console.error);
            });
            
        } catch (error) {
            console.error('Error in user command:', error);
            const errorEmbed = utils.createErrorEmbed(
                'Error',
                'An error occurred while fetching your account information.',
                interaction.user
            );
            
            await interaction.editReply({ 
                embeds: [errorEmbed],
                ephemeral: true 
            });
        }
    },
}; 