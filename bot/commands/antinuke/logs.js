const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getConfig, saveConfig, isAuthorized, createEmbed } = require('./utils');
const settings = require('../../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Configure logging for the AntiNuke system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the channel for AntiNuke logs')
                .addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('The channel to send AntiNuke logs to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable AntiNuke logging'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current logging settings'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // Command information for prefix command
    prefix: settings.api.client.bot.prefix + 'logs',
    description: 'Configure logging for the AntiNuke system',
    usage: 'set <channel>|disable|view',
    
    async execute(interaction) {
        // Get the guild
        const guild = interaction.guild;
        
        // Get the antinuke configuration
        const config = getConfig(guild.id);
        
        // Check if the user is authorized (server owner or extra owner)
        if (!isAuthorized(guild, interaction.user, config)) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner or designated extra owners can manage the AntiNuke logging settings.',
                '#FF0000'
            );
            
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        // Handle subcommands
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');
            
            // Set the logging channel
            config.logs = channel.id;
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'Logging Channel Set', 
                `AntiNuke logs will now be sent to ${channel}.`,
                '#00FF00'
            );
            
            // Send a test log to the channel
            try {
                const testEmbed = createEmbed(
                    'Logging Test', 
                    'This is a test message to confirm that AntiNuke logs are properly configured.',
                    '#0099FF'
                );
                
                await channel.send({ embeds: [testEmbed] });
            } catch (error) {
                console.error(`Error sending test log to channel ${channel.id}:`, error);
                
                const errorEmbed = createEmbed(
                    'Warning', 
                    `The bot may not have permission to send messages to ${channel}. Please ensure the bot has proper permissions.`,
                    '#FFA500'
                );
                
                return interaction.reply({ embeds: [errorEmbed] });
            }
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'disable') {
            // Disable logging
            config.logs = null;
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'Logging Disabled', 
                'AntiNuke logging has been disabled. No logs will be sent for AntiNuke events.',
                '#FFA500'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'view') {
            let description;
            
            if (config.logs) {
                description = `AntiNuke logs are currently being sent to <#${config.logs}>.`;
            } else {
                description = 'AntiNuke logging is currently disabled.';
            }
            
            const embed = createEmbed(
                'Logging Settings', 
                description,
                '#0099FF'
            );
            
            return interaction.reply({ embeds: [embed] });
        }
    },
    
    // Handle prefix commands
    async handlePrefix(message, args) {
        // Get the guild
        const guild = message.guild;
        
        // Get the antinuke configuration
        const config = getConfig(guild.id);
        
        // Check if the user is authorized (server owner or extra owner)
        if (!isAuthorized(guild, message.author, config)) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner or designated extra owners can manage the AntiNuke logging settings.',
                '#FF0000'
            );
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        // Check for subcommand
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'set') {
            // Get the channel
            const channelMention = args[1];
            
            if (!channelMention) {
                const helpEmbed = createEmbed(
                    'Missing Channel', 
                    `Please specify a channel for logs.\n\n**Usage:** ${settings.api.client.bot.prefix}logs set <channel>`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            // Extract channel ID from mention
            const channelId = channelMention.replace(/[<#>]/g, '');
            
            try {
                const channel = await message.guild.channels.fetch(channelId);
                
                if (!channel || channel.type !== ChannelType.GuildText) {
                    const errorEmbed = createEmbed(
                        'Invalid Channel', 
                        'Please specify a valid text channel.',
                        '#FF0000'
                    );
                    
                    return message.reply({ embeds: [errorEmbed] });
                }
                
                // Set the logging channel
                config.logs = channel.id;
                saveConfig(guild.id, config);
                
                const embed = createEmbed(
                    'Logging Channel Set', 
                    `AntiNuke logs will now be sent to ${channel}.`,
                    '#00FF00'
                );
                
                // Send a test log to the channel
                try {
                    const testEmbed = createEmbed(
                        'Logging Test', 
                        'This is a test message to confirm that AntiNuke logs are properly configured.',
                        '#0099FF'
                    );
                    
                    await channel.send({ embeds: [testEmbed] });
                } catch (error) {
                    console.error(`Error sending test log to channel ${channel.id}:`, error);
                    
                    const errorEmbed = createEmbed(
                        'Warning', 
                        `The bot may not have permission to send messages to ${channel}. Please ensure the bot has proper permissions.`,
                        '#FFA500'
                    );
                    
                    return message.reply({ embeds: [errorEmbed] });
                }
                
                return message.reply({ embeds: [embed] });
            } catch (error) {
                const errorEmbed = createEmbed(
                    'Invalid Channel', 
                    'Could not find the specified channel. Please provide a valid channel mention or ID.',
                    '#FF0000'
                );
                
                return message.reply({ embeds: [errorEmbed] });
            }
        } else if (subcommand === 'disable') {
            // Disable logging
            config.logs = null;
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'Logging Disabled', 
                'AntiNuke logging has been disabled. No logs will be sent for AntiNuke events.',
                '#FFA500'
            );
            
            return message.reply({ embeds: [embed] });
        } else if (subcommand === 'view') {
            let description;
            
            if (config.logs) {
                description = `AntiNuke logs are currently being sent to <#${config.logs}>.`;
            } else {
                description = 'AntiNuke logging is currently disabled.';
            }
            
            const embed = createEmbed(
                'Logging Settings', 
                description,
                '#0099FF'
            );
            
            return message.reply({ embeds: [embed] });
        } else {
            // Show help
            const helpEmbed = createEmbed(
                'Logs Help',
                `**Usage:** ${settings.api.client.bot.prefix}logs <set|disable|view> [channel]\n\n` +
                `**set <channel>** - Set the channel for AntiNuke logs\n` +
                `**disable** - Disable AntiNuke logging\n` +
                `**view** - View the current logging settings`,
                '#0099FF'
            );
            
            return message.reply({ embeds: [helpEmbed] });
        }
    }
};
