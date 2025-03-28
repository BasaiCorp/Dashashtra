const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig, isAuthorized, createEmbed } = require('./utils');
const settings = require('../../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('protection')
        .setDescription('Configure protection settings for the AntiNuke system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle a specific protection feature')
                .addStringOption(option => 
                    option.setName('feature')
                        .setDescription('The protection feature to toggle')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Mass Ban Protection', value: 'massban' },
                            { name: 'Webhook Creation Protection', value: 'webhookCreate' },
                            { name: 'Channel Deletion Protection', value: 'channelDelete' },
                            { name: 'Channel Creation Protection', value: 'channelCreate' },
                            { name: 'Role Deletion Protection', value: 'roleDelete' },
                            { name: 'Role Creation Protection', value: 'roleCreate' },
                            { name: 'Bot Addition Protection', value: 'botAdd' },
                            { name: 'Member Admin Protection', value: 'memberAdmin' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current protection settings'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('threshold')
                .setDescription('Set the threshold for mass ban detection')
                .addIntegerOption(option => 
                    option.setName('count')
                        .setDescription('Number of bans in quick succession to trigger protection')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(20))
                .addIntegerOption(option => 
                    option.setName('window')
                        .setDescription('Time window in seconds')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(60)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // Command information for prefix command
    prefix: settings.api.client.bot.prefix + 'protection',
    description: 'Configure protection settings for the AntiNuke system',
    usage: 'toggle <feature>|view|threshold <count> <window>',
    
    async execute(interaction) {
        // Get the guild
        const guild = interaction.guild;
        
        // Get the antinuke configuration
        const config = getConfig(guild.id);
        
        // Check if the user is authorized (server owner or extra owner)
        if (!isAuthorized(guild, interaction.user, config)) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner or designated extra owners can manage the AntiNuke protection settings.',
                '#FF0000'
            );
            
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        // Handle subcommands
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'toggle') {
            const feature = interaction.options.getString('feature');
            
            // Toggle the protection feature
            config.protections[feature] = !config.protections[feature];
            saveConfig(guild.id, config);
            
            // Get a user-friendly name for the feature
            const featureNames = {
                massban: 'Mass Ban Protection',
                webhookCreate: 'Webhook Creation Protection',
                channelDelete: 'Channel Deletion Protection',
                channelCreate: 'Channel Creation Protection',
                roleDelete: 'Role Deletion Protection',
                roleCreate: 'Role Creation Protection',
                botAdd: 'Bot Addition Protection',
                memberAdmin: 'Member Admin Protection'
            };
            
            const embed = createEmbed(
                'Protection Updated', 
                `${featureNames[feature]} has been **${config.protections[feature] ? 'enabled' : 'disabled'}**.`,
                '#00FF00'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'view') {
            // Create an embed to display all protection settings
            const protectionEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Protection Settings')
                .setColor('#0099FF')
                .setDescription(`Below are the current protection settings for this server.${config.enabled ? '' : '\n\n⚠️ **Note:** The AntiNuke system is currently disabled.'}`)
                .addFields(
                    { name: 'Mass Ban Protection', value: config.protections.massban ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Webhook Creation', value: config.protections.webhookCreate ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Channel Deletion', value: config.protections.channelDelete ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Channel Creation', value: config.protections.channelCreate ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Role Deletion', value: config.protections.roleDelete ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Role Creation', value: config.protections.roleCreate ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Bot Addition', value: config.protections.botAdd ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Member Admin', value: config.protections.memberAdmin ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Mass Ban Threshold', value: `${config.thresholds.massban} bans in ${config.thresholds.timeWindow / 1000} seconds`, inline: false }
                )
                .setFooter({ 
                    text: settings.website.name + ' | AntiNuke System', 
                    iconURL: settings.website.favicon 
                })
                .setTimestamp();
            
            return interaction.reply({ embeds: [protectionEmbed] });
        } else if (subcommand === 'threshold') {
            const count = interaction.options.getInteger('count');
            const window = interaction.options.getInteger('window');
            
            // Update the threshold settings
            config.thresholds.massban = count;
            config.thresholds.timeWindow = window * 1000; // Convert to milliseconds
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'Threshold Updated', 
                `Mass ban threshold has been updated to **${count} bans** within **${window} seconds**.`,
                '#00FF00'
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
                'Only the server owner or designated extra owners can manage the AntiNuke protection settings.',
                '#FF0000'
            );
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        // Check for subcommand
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'toggle') {
            const feature = args[1]?.toLowerCase();
            
            // Map of valid features and their friendly names
            const featureMap = {
                'massban': 'massban',
                'webhook': 'webhookCreate',
                'channeldelete': 'channelDelete',
                'channelcreate': 'channelCreate',
                'roledelete': 'roleDelete',
                'rolecreate': 'roleCreate',
                'botadd': 'botAdd',
                'memberadmin': 'memberAdmin'
            };
            
            // Validate feature
            if (!feature || !featureMap[feature]) {
                const helpEmbed = createEmbed(
                    'Invalid Feature', 
                    `Please specify a valid protection feature to toggle.\n\n**Valid features:** massban, webhook, channeldelete, channelcreate, roledelete, rolecreate, botadd, memberadmin\n\n**Usage:** ${settings.api.client.bot.prefix}protection toggle <feature>`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            // Get the actual feature key
            const featureKey = featureMap[feature];
            
            // Toggle the protection feature
            config.protections[featureKey] = !config.protections[featureKey];
            saveConfig(guild.id, config);
            
            // Get a user-friendly name for the feature
            const featureNames = {
                massban: 'Mass Ban Protection',
                webhookCreate: 'Webhook Creation Protection',
                channelDelete: 'Channel Deletion Protection',
                channelCreate: 'Channel Creation Protection',
                roleDelete: 'Role Deletion Protection',
                roleCreate: 'Role Creation Protection',
                botAdd: 'Bot Addition Protection',
                memberAdmin: 'Member Admin Protection'
            };
            
            const embed = createEmbed(
                'Protection Updated', 
                `${featureNames[featureKey]} has been **${config.protections[featureKey] ? 'enabled' : 'disabled'}**.`,
                '#00FF00'
            );
            
            return message.reply({ embeds: [embed] });
        } else if (subcommand === 'view') {
            // Create an embed to display all protection settings
            const protectionEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Protection Settings')
                .setColor('#0099FF')
                .setDescription(`Below are the current protection settings for this server.${config.enabled ? '' : '\n\n⚠️ **Note:** The AntiNuke system is currently disabled.'}`)
                .addFields(
                    { name: 'Mass Ban Protection', value: config.protections.massban ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Webhook Creation', value: config.protections.webhookCreate ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Channel Deletion', value: config.protections.channelDelete ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Channel Creation', value: config.protections.channelCreate ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Role Deletion', value: config.protections.roleDelete ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Role Creation', value: config.protections.roleCreate ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Bot Addition', value: config.protections.botAdd ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Member Admin', value: config.protections.memberAdmin ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Mass Ban Threshold', value: `${config.thresholds.massban} bans in ${config.thresholds.timeWindow / 1000} seconds`, inline: false }
                )
                .setFooter({ 
                    text: settings.website.name + ' | AntiNuke System', 
                    iconURL: settings.website.favicon 
                })
                .setTimestamp();
            
            return message.reply({ embeds: [protectionEmbed] });
        } else if (subcommand === 'threshold') {
            const count = parseInt(args[1]);
            const window = parseInt(args[2]);
            
            // Validate arguments
            if (isNaN(count) || isNaN(window) || count < 1 || count > 20 || window < 1 || window > 60) {
                const helpEmbed = createEmbed(
                    'Invalid Arguments', 
                    `Please provide valid threshold values.\n\n**Usage:** ${settings.api.client.bot.prefix}protection threshold <count> <window>\n\n- Count: Number of bans (1-20)\n- Window: Time in seconds (1-60)`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            // Update the threshold settings
            config.thresholds.massban = count;
            config.thresholds.timeWindow = window * 1000; // Convert to milliseconds
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'Threshold Updated', 
                `Mass ban threshold has been updated to **${count} bans** within **${window} seconds**.`,
                '#00FF00'
            );
            
            return message.reply({ embeds: [embed] });
        } else {
            // Show help
            const helpEmbed = createEmbed(
                'Protection Help',
                `**Usage:** ${settings.api.client.bot.prefix}protection <toggle|view|threshold> [options]\n\n` +
                `**toggle <feature>** - Toggle a specific protection feature on/off\n` +
                `**view** - View all current protection settings\n` +
                `**threshold <count> <window>** - Set the threshold for mass ban detection\n\n` +
                `**Valid features for toggle:**\n` +
                `massban, webhook, channeldelete, channelcreate, roledelete, rolecreate, botadd, memberadmin`,
                '#0099FF'
            );
            
            return message.reply({ embeds: [helpEmbed] });
        }
    }
};
