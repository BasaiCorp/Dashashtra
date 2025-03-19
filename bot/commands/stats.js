const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settings = require('../../settings.json');
const os = require('os');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Shows dashboard statistics'),
    async execute(interaction) {
        await interaction.deferReply();
        
        // Get the database from the main application
        const indexjs = require('../../index.js');
        const db = indexjs.db;
        
        try {
            // Count statistics 
            const userCount = await db.users.getUserCount();
            const serverCount = await db.servers.getServerCount(); 
            
            // Get uptime information
            const botUptime = formatUptime(interaction.client.uptime);
            const systemUptime = formatUptime(os.uptime() * 1000);
            
            // Create embed with dashboard info
            const statsEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`${settings.website.name} Stats`)
                .setURL(settings.website.url)
                .setDescription('Dashboard statistics and information')
                .setThumbnail(settings.website.favicon)
                .addFields(
                    { name: '👥 Total Users', value: `${userCount || 0}`, inline: true },
                    { name: '🖥️ Total Servers', value: `${serverCount || 0}`, inline: true },
                    { name: '🌐 Panel Domain', value: `[${settings.pterodactyl.domain.replace(/https?:\/\//, '')}](${settings.pterodactyl.domain})`, inline: true },
                    { name: '⏱️ Bot Uptime', value: botUptime, inline: true },
                    { name: '🔄 System Uptime', value: systemUptime, inline: true },
                    { name: '📊 Version', value: settings.version, inline: true }
                )
                .setFooter({ text: `${settings.website.name} • Requested by ${interaction.user.tag}`, iconURL: settings.website.favicon })
                .setTimestamp();
            
            // Create action buttons
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
                        .setCustomId('refresh_stats')
                        .setLabel('Refresh Stats')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );
            
            const response = await interaction.editReply({
                embeds: [statsEmbed],
                components: [row]
            });
            
            // Create a collector for button interactions
            const collector = response.createMessageComponentCollector({ 
                time: 60000 // 60 seconds
            });
            
            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'This button is not for you!', ephemeral: true });
                }
                
                if (i.customId === 'refresh_stats') {
                    // Get updated statistics
                    const updatedUserCount = await db.users.getUserCount();
                    const updatedServerCount = await db.servers.getServerCount();
                    const updatedBotUptime = formatUptime(interaction.client.uptime);
                    const updatedSystemUptime = formatUptime(os.uptime() * 1000);
                    
                    // Update the embed
                    const updatedEmbed = EmbedBuilder.from(statsEmbed)
                        .setFields(
                            { name: '👥 Total Users', value: `${updatedUserCount || 0}`, inline: true },
                            { name: '🖥️ Total Servers', value: `${updatedServerCount || 0}`, inline: true },
                            { name: '🌐 Panel Domain', value: `[${settings.pterodactyl.domain.replace(/https?:\/\//, '')}](${settings.pterodactyl.domain})`, inline: true },
                            { name: '⏱️ Bot Uptime', value: updatedBotUptime, inline: true },
                            { name: '🔄 System Uptime', value: updatedSystemUptime, inline: true },
                            { name: '📊 Version', value: settings.version, inline: true }
                        )
                        .setTimestamp();
                    
                    await i.update({ embeds: [updatedEmbed], components: [row] });
                }
            });
            
            collector.on('end', () => {
                // Disable the refresh button when collector expires
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
                            .setCustomId('refresh_stats')
                            .setLabel('Refresh Stats')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🔄')
                            .setDisabled(true)
                    );
                
                interaction.editReply({ 
                    embeds: [statsEmbed], 
                    components: [disabledRow] 
                }).catch(console.error);
            });
        } catch (error) {
            console.error('Error in stats command:', error);
            await interaction.editReply({ 
                content: 'An error occurred while fetching dashboard statistics.', 
                ephemeral: true 
            });
        }
    },
};

// Helper function to format uptime
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
} 