const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const settings = require('../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Shows dashboard statistics'),
    async execute(interaction) {
        // Get the database from the main application
        const indexjs = require('../../index.js');
        const db = indexjs.db;
        
        try {
            // Count total users 
            const userCount = await db.users.getUserCount();
            
            // Create embed with dashboard info
            const statsEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`${settings.website.name} Stats`)
                .setURL(settings.website.url)
                .setDescription('Dashboard statistics and information')
                .addFields(
                    { name: 'Total Users', value: `${userCount || 0}`, inline: true },
                    { name: 'Panel Domain', value: `[${settings.pterodactyl.domain.replace('https://', '')}](${settings.pterodactyl.domain})`, inline: true },
                    { name: 'Dashboard Version', value: settings.version, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `${settings.website.name}`, iconURL: settings.website.favicon });
            
            await interaction.reply({ embeds: [statsEmbed] });
        } catch (error) {
            console.error('Error in stats command:', error);
            await interaction.reply({ 
                content: 'An error occurred while fetching dashboard statistics.', 
                ephemeral: true 
            });
        }
    },
}; 