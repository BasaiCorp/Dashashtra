const { Events, Collection } = require('discord.js');
const settings = require('../../settings.json');
const utils = require('../utils');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);

                if (!command) {
                    console.error(`No command matching ${interaction.commandName} was found.`);
                    return;
                }

                try {
                    await command.execute(interaction);
                } catch (error) {
                    console.error(`Error executing ${interaction.commandName}`);
                    console.error(error);
                    
                    const errorEmbed = utils.createErrorEmbed(
                        'Command Error',
                        'There was an error while executing this command!',
                        interaction.user
                    );
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
                return;
            }
            
            // Handle button interactions
            if (interaction.isButton()) {
                // Track if we already handled this button
                let handled = false;
                
                // Dashboard link button
                if (interaction.customId === 'dashboard_link') {
                    await interaction.reply({
                        content: `🔗 **Dashboard Link**: ${settings.website.url}`,
                        ephemeral: true
                    });
                    handled = true;
                }
                
                // If button not handled, it's likely managed by a collector in the command file
                if (!handled) {
                    // Let the collector in the original command handle it
                    // This is just a fallback in case we have "global" buttons that aren't managed by collectors
                    console.log(`Button interaction "${interaction.customId}" handled by collector.`);
                }
            }
            
        } catch (error) {
            console.error('Error in interactionCreate event:');
            console.error(error);
        }
    },
}; 