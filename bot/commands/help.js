const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
        
        // Load all commands
        const commands = [];
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                commands.push({
                    name: command.data.name,
                    description: command.data.description
                });
            }
        }
        
        // Create embed for help menu
        const createHelpEmbed = (page = 0) => {
            // Show 5 commands per page
            const pageSize = 5;
            const pageCount = Math.ceil(commands.length / pageSize);
            const currentPage = Math.max(0, Math.min(page, pageCount - 1));
            const startIndex = currentPage * pageSize;
            
            const helpEmbed = new EmbedBuilder()
                .setColor(0x5865F2) // Discord Blue
                .setTitle(`${settings.website.name} Bot Commands`)
                .setDescription(`Help page ${currentPage + 1}/${pageCount}`)
                .setURL(settings.website.url)
                .setThumbnail(settings.website.favicon)
                .setTimestamp()
                .setFooter({ text: `${settings.website.name} • Page ${currentPage + 1}/${pageCount}`, iconURL: settings.website.favicon });
            
            // Add commands for current page
            const pageCommands = commands.slice(startIndex, startIndex + pageSize);
            
            if (pageCommands.length > 0) {
                for (const cmd of pageCommands) {
                    helpEmbed.addFields({
                        name: `/${cmd.name}`,
                        value: cmd.description,
                        inline: false
                    });
                }
            } else {
                helpEmbed.setDescription('No commands available.');
            }
            
            // Add links to dashboard
            helpEmbed.addFields({
                name: '\u200B', // Empty field for spacing
                value: `[Visit Dashboard](${settings.website.url}) | [Support Server](https://discord.gg/${settings.api.client.bot.guildId || settings.discord.guild_id})`,
                inline: false
            });
            
            return { embed: helpEmbed, currentPage, pageCount };
        };
        
        // Create initial embed
        const { embed: initialEmbed, currentPage, pageCount } = createHelpEmbed();
        
        // Create pagination buttons
        const getButtons = (currentPage, pageCount) => {
            const row = new ActionRowBuilder();
            
            // Add dashboard button
            row.addComponents(
                new ButtonBuilder()
                    .setLabel('Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(settings.website.url)
            );
            
            // Only add pagination buttons if there are multiple pages
            if (pageCount > 1) {
                // Previous button
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                        .setDisabled(currentPage === 0)
                );
                
                // Next button
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('➡️')
                        .setDisabled(currentPage === pageCount - 1)
                );
            }
            
            return row;
        };
        
        // Send the initial embed with buttons
        const initialButtons = getButtons(currentPage, pageCount);
        const reply = await interaction.reply({ 
            embeds: [initialEmbed], 
            components: pageCount > 1 ? [initialButtons] : [],
            fetchReply: true
        });
        
        // Only set up collector if there are multiple pages
        if (pageCount > 1) {
            // Create a collector for button interactions
            const collector = reply.createMessageComponentCollector({ 
                time: 60000 // 60 seconds
            });
            
            let page = currentPage;
            
            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'These buttons are not for you!', ephemeral: true });
                }
                
                if (i.customId === 'prev_page') {
                    page = Math.max(0, page - 1);
                } else if (i.customId === 'next_page') {
                    page = Math.min(pageCount - 1, page + 1);
                }
                
                const { embed: newEmbed } = createHelpEmbed(page);
                const newButtons = getButtons(page, pageCount);
                
                await i.update({ embeds: [newEmbed], components: [newButtons] });
            });
            
            collector.on('end', () => {
                // Disable buttons when collector expires
                const disabledButtons = new ActionRowBuilder();
                
                // Add dashboard button (always enabled as it's a link)
                disabledButtons.addComponents(
                    new ButtonBuilder()
                        .setLabel('Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(settings.website.url)
                );
                
                // Add disabled pagination buttons
                if (pageCount > 1) {
                    disabledButtons.addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_page')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('⬅️')
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('➡️')
                            .setDisabled(true)
                    );
                }
                
                interaction.editReply({ 
                    embeds: [initialEmbed], 
                    components: [disabledButtons] 
                }).catch(console.error);
            });
        }
    },
}; 