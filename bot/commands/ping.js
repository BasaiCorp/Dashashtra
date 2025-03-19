const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settings = require('../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with the bot latency'),
    async execute(interaction) {
        const sent = await interaction.deferReply({ fetchReply: true });
        const ping = sent.createdTimestamp - interaction.createdTimestamp;
        const apiPing = Math.round(interaction.client.ws.ping);
        
        // Create ping embed
        const pingEmbed = new EmbedBuilder()
            .setColor(0x00FF00) // Green color
            .setTitle('🏓 Pong!')
            .setDescription(`Checking the connection to ${settings.website.name}'s services.`)
            .addFields(
                { name: 'Bot Latency', value: `${ping}ms`, inline: true },
                { name: 'API Latency', value: `${apiPing}ms`, inline: true }
            )
            .setFooter({ text: settings.website.name, iconURL: settings.website.favicon })
            .setTimestamp();

        // Create buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Visit Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(settings.website.url),
                new ButtonBuilder()
                    .setCustomId('refresh_ping')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );

        const response = await interaction.editReply({
            embeds: [pingEmbed],
            components: [row]
        });

        // Create a collector for button interactions
        const collector = response.createMessageComponentCollector({ 
            time: 30000 // 30 seconds
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'This button is not for you!', ephemeral: true });
            }

            if (i.customId === 'refresh_ping') {
                const newPing = i.createdTimestamp - interaction.createdTimestamp;
                const newApiPing = Math.round(interaction.client.ws.ping);
                
                // Update the ping embed
                pingEmbed
                    .setFields(
                        { name: 'Bot Latency', value: `${newPing}ms`, inline: true },
                        { name: 'API Latency', value: `${newApiPing}ms`, inline: true }
                    )
                    .setTimestamp();
                
                await i.update({ embeds: [pingEmbed], components: [row] });
            }
        });

        collector.on('end', () => {
            // Remove buttons when collector expires
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Visit Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(settings.website.url),
                    new ButtonBuilder()
                        .setCustomId('refresh_ping')
                        .setLabel('Refresh')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔄')
                        .setDisabled(true)
                );
            
            interaction.editReply({ embeds: [pingEmbed], components: [disabledRow] }).catch(console.error);
        });
    },
}; 