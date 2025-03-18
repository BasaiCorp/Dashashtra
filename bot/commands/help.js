const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const settings = require('../../settings.json');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands'),
    async execute(interaction) {
        // Get all command files
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        // Create embed for help menu
        const helpEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`${settings.website.name} Bot Commands`)
            .setDescription('Here are all the available commands:')
            .setURL(settings.website.url)
            .setTimestamp()
            .setFooter({ text: `${settings.website.name}`, iconURL: settings.website.favicon });
        
        // Add each command to the embed
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                helpEmbed.addFields({
                    name: `/${command.data.name}`,
                    value: command.data.description,
                    inline: false
                });
            }
        }
        
        // Add link to dashboard
        helpEmbed.addFields({
            name: '\u200B', // Empty field for spacing
            value: `[Visit Dashboard](${settings.website.url}) | [Support Server](https://discord.gg/${settings.api.bot.guildId})`,
            inline: false
        });
        
        await interaction.reply({ embeds: [helpEmbed] });
    },
}; 