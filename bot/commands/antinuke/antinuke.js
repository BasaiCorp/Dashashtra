const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig, isAuthorized, createEmbed } = require('./utils');
const settings = require('../../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Enable or disable the AntiNuke system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable the AntiNuke system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable the AntiNuke system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check the current status of the AntiNuke system'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // Command information for prefix command
    prefix: settings.api.client.bot.prefix + 'antinuke',
    description: 'Enable or disable the AntiNuke system',
    usage: 'enable|disable|status',
    
    async execute(interaction) {
        // Get the guild
        const guild = interaction.guild;
        
        // Get the antinuke configuration
        const config = getConfig(guild.id);
        
        // Check if the user is authorized (server owner or extra owner)
        if (!isAuthorized(guild, interaction.user, config)) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner or designated extra owners can manage the AntiNuke system.',
                '#FF0000'
            );
            
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        // Handle subcommands
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'enable') {
            // Enable the antinuke system
            config.enabled = true;
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'AntiNuke Enabled', 
                'The AntiNuke system has been enabled for this server. Your server is now protected against nuking attempts.',
                '#00FF00'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'disable') {
            // Disable the antinuke system
            config.enabled = false;
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'AntiNuke Disabled', 
                'The AntiNuke system has been disabled for this server. Your server is no longer protected.',
                '#FF0000'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'status') {
            // Show the current status
            const statusEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Status')
                .setColor(config.enabled ? '#00FF00' : '#FF0000')
                .setDescription(`The AntiNuke system is currently **${config.enabled ? 'ENABLED' : 'DISABLED'}**`)
                .addFields(
                    { name: 'Whitelisted Users', value: `${config.whitelist.length} users`, inline: true },
                    { name: 'Extra Owners', value: `${config.extraOwners.length} users`, inline: true },
                    { name: 'Punishment', value: config.punishment.charAt(0).toUpperCase() + config.punishment.slice(1), inline: true }
                )
                .addFields(
                    { name: 'Protections', value: Object.entries(config.protections)
                        .map(([key, value]) => `${value ? '✅' : '❌'} ${key.replace(/([A-Z])/g, ' $1').trim()}`)
                        .join('\n')
                    }
                )
                .setFooter({ 
                    text: settings.website.name + ' | AntiNuke System', 
                    iconURL: settings.website.favicon 
                })
                .setTimestamp();
            
            return interaction.reply({ embeds: [statusEmbed] });
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
                'Only the server owner or designated extra owners can manage the AntiNuke system.',
                '#FF0000'
            );
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        // Check for subcommand
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'enable') {
            // Enable the antinuke system
            config.enabled = true;
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'AntiNuke Enabled', 
                'The AntiNuke system has been enabled for this server. Your server is now protected against nuking attempts.',
                '#00FF00'
            );
            
            return message.reply({ embeds: [embed] });
        } else if (subcommand === 'disable') {
            // Disable the antinuke system
            config.enabled = false;
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'AntiNuke Disabled', 
                'The AntiNuke system has been disabled for this server. Your server is no longer protected.',
                '#FF0000'
            );
            
            return message.reply({ embeds: [embed] });
        } else if (subcommand === 'status') {
            // Show the current status
            const statusEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Status')
                .setColor(config.enabled ? '#00FF00' : '#FF0000')
                .setDescription(`The AntiNuke system is currently **${config.enabled ? 'ENABLED' : 'DISABLED'}**`)
                .addFields(
                    { name: 'Whitelisted Users', value: `${config.whitelist.length} users`, inline: true },
                    { name: 'Extra Owners', value: `${config.extraOwners.length} users`, inline: true },
                    { name: 'Punishment', value: config.punishment.charAt(0).toUpperCase() + config.punishment.slice(1), inline: true }
                )
                .addFields(
                    { name: 'Protections', value: Object.entries(config.protections)
                        .map(([key, value]) => `${value ? '✅' : '❌'} ${key.replace(/([A-Z])/g, ' $1').trim()}`)
                        .join('\n')
                    }
                )
                .setFooter({ 
                    text: settings.website.name + ' | AntiNuke System', 
                    iconURL: settings.website.favicon 
                })
                .setTimestamp();
            
            return message.reply({ embeds: [statusEmbed] });
        } else {
            // Show help
            const helpEmbed = createEmbed(
                'AntiNuke Help',
                `**Usage:** ${settings.api.client.bot.prefix}antinuke <enable|disable|status>\n\n` +
                `**enable** - Enable the AntiNuke system\n` +
                `**disable** - Disable the AntiNuke system\n` +
                `**status** - Check the current status of the AntiNuke system`,
                '#0099FF'
            );
            
            return message.reply({ embeds: [helpEmbed] });
        }
    }
};
