const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const settings = require('../../settings.json');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('Shows your server information'),
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
                return interaction.editReply({ 
                    content: `You're not linked to any account on ${settings.website.name}. Please login with Discord on our dashboard: ${settings.website.url}`,
                    ephemeral: true 
                });
            }
            
            // Fetch user's servers
            const userServers = await db.servers.getUserServers(user.id);
            
            if (!userServers || userServers.length === 0) {
                return interaction.editReply({ 
                    content: `You don't have any servers on ${settings.website.name}. Create one at ${settings.website.url}/create`,
                    ephemeral: true 
                });
            }
            
            // Create embed with user's servers
            const serverEmbed = new EmbedBuilder()
                .setColor(0x00AE86)
                .setTitle(`Your Servers on ${settings.website.name}`)
                .setDescription(`You have ${userServers.length} server(s) on our platform.`)
                .setURL(`${settings.website.url}/servers`)
                .setTimestamp()
                .setFooter({ text: `${settings.website.name}`, iconURL: settings.website.favicon });
            
            // Add each server to the embed
            userServers.slice(0, 10).forEach((server, index) => {
                serverEmbed.addFields({
                    name: `${index + 1}. ${server.name}`,
                    value: `**ID:** ${server.pterodactyl_id}\n**Description:** ${server.description || 'No description'}`,
                    inline: false
                });
            });
            
            if (userServers.length > 10) {
                serverEmbed.addFields({
                    name: 'And more...',
                    value: `View all your servers at ${settings.website.url}/servers`,
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [serverEmbed], ephemeral: true });
            
        } catch (error) {
            console.error('Error in servers command:', error);
            await interaction.editReply({ 
                content: 'An error occurred while fetching your servers.',
                ephemeral: true 
            });
        }
    },
}; 