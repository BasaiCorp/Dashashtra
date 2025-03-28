const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig, isAuthorized, createEmbed } = require('./utils');
const settings = require('../../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Manage the AntiNuke whitelist')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the AntiNuke whitelist')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to add to the whitelist')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the AntiNuke whitelist')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to remove from the whitelist')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all whitelisted users'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // Command information for prefix command
    prefix: settings.api.client.bot.prefix + 'whitelist',
    description: 'Manage the AntiNuke whitelist',
    usage: 'add <user>|remove <user>|list',
    
    async execute(interaction) {
        // Get the guild
        const guild = interaction.guild;
        
        // Get the antinuke configuration
        const config = getConfig(guild.id);
        
        // Check if the user is authorized (server owner or extra owner)
        if (!isAuthorized(guild, interaction.user, config)) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner or designated extra owners can manage the AntiNuke whitelist.',
                '#FF0000'
            );
            
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        // Handle subcommands
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'add') {
            const user = interaction.options.getUser('user');
            
            // Check if user is already whitelisted
            if (config.whitelist.includes(user.id)) {
                const alreadyEmbed = createEmbed(
                    'Already Whitelisted', 
                    `${user.tag} is already in the AntiNuke whitelist.`,
                    '#FFA500'
                );
                
                return interaction.reply({ embeds: [alreadyEmbed], ephemeral: true });
            }
            
            // Add user to whitelist
            config.whitelist.push(user.id);
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'User Whitelisted', 
                `${user.tag} has been added to the AntiNuke whitelist. They will be exempt from AntiNuke protections.`,
                '#00FF00'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'remove') {
            const user = interaction.options.getUser('user');
            
            // Check if user is whitelisted
            if (!config.whitelist.includes(user.id)) {
                const notEmbed = createEmbed(
                    'Not Whitelisted', 
                    `${user.tag} is not in the AntiNuke whitelist.`,
                    '#FFA500'
                );
                
                return interaction.reply({ embeds: [notEmbed], ephemeral: true });
            }
            
            // Remove user from whitelist
            config.whitelist = config.whitelist.filter(id => id !== user.id);
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'User Removed', 
                `${user.tag} has been removed from the AntiNuke whitelist. They will now be subject to AntiNuke protections.`,
                '#00FF00'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'list') {
            // Fetch user data for all whitelisted users
            const whitelistedUsers = [];
            
            for (const userId of config.whitelist) {
                try {
                    const user = await interaction.client.users.fetch(userId);
                    whitelistedUsers.push(`<@${userId}> (${user.tag})`);
                } catch (error) {
                    whitelistedUsers.push(`<@${userId}> (Unknown User)`);
                }
            }
            
            const listEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Whitelist')
                .setColor('#0099FF')
                .setDescription(whitelistedUsers.length > 0 
                    ? whitelistedUsers.join('\n') 
                    : 'No users are currently whitelisted.')
                .setFooter({ 
                    text: settings.website.name + ' | AntiNuke System', 
                    iconURL: settings.website.favicon 
                })
                .setTimestamp();
            
            return interaction.reply({ embeds: [listEmbed] });
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
                'Only the server owner or designated extra owners can manage the AntiNuke whitelist.',
                '#FF0000'
            );
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        // Check for subcommand
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'add') {
            // Get the user
            const userId = args[1]?.replace(/[<@!>]/g, '');
            
            if (!userId) {
                const helpEmbed = createEmbed(
                    'Missing User', 
                    `Please specify a user to add to the whitelist.\n\n**Usage:** ${settings.api.client.bot.prefix}whitelist add <user>`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            try {
                const user = await message.client.users.fetch(userId);
                
                // Check if user is already whitelisted
                if (config.whitelist.includes(user.id)) {
                    const alreadyEmbed = createEmbed(
                        'Already Whitelisted', 
                        `${user.tag} is already in the AntiNuke whitelist.`,
                        '#FFA500'
                    );
                    
                    return message.reply({ embeds: [alreadyEmbed] });
                }
                
                // Add user to whitelist
                config.whitelist.push(user.id);
                saveConfig(guild.id, config);
                
                const embed = createEmbed(
                    'User Whitelisted', 
                    `${user.tag} has been added to the AntiNuke whitelist. They will be exempt from AntiNuke protections.`,
                    '#00FF00'
                );
                
                return message.reply({ embeds: [embed] });
            } catch (error) {
                const errorEmbed = createEmbed(
                    'Invalid User', 
                    'Could not find the specified user. Please provide a valid user ID or mention.',
                    '#FF0000'
                );
                
                return message.reply({ embeds: [errorEmbed] });
            }
        } else if (subcommand === 'remove') {
            // Get the user
            const userId = args[1]?.replace(/[<@!>]/g, '');
            
            if (!userId) {
                const helpEmbed = createEmbed(
                    'Missing User', 
                    `Please specify a user to remove from the whitelist.\n\n**Usage:** ${settings.api.client.bot.prefix}whitelist remove <user>`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            try {
                const user = await message.client.users.fetch(userId);
                
                // Check if user is whitelisted
                if (!config.whitelist.includes(user.id)) {
                    const notEmbed = createEmbed(
                        'Not Whitelisted', 
                        `${user.tag} is not in the AntiNuke whitelist.`,
                        '#FFA500'
                    );
                    
                    return message.reply({ embeds: [notEmbed] });
                }
                
                // Remove user from whitelist
                config.whitelist = config.whitelist.filter(id => id !== user.id);
                saveConfig(guild.id, config);
                
                const embed = createEmbed(
                    'User Removed', 
                    `${user.tag} has been removed from the AntiNuke whitelist. They will now be subject to AntiNuke protections.`,
                    '#00FF00'
                );
                
                return message.reply({ embeds: [embed] });
            } catch (error) {
                const errorEmbed = createEmbed(
                    'Invalid User', 
                    'Could not find the specified user. Please provide a valid user ID or mention.',
                    '#FF0000'
                );
                
                return message.reply({ embeds: [errorEmbed] });
            }
        } else if (subcommand === 'list') {
            // Fetch user data for all whitelisted users
            const whitelistedUsers = [];
            
            for (const userId of config.whitelist) {
                try {
                    const user = await message.client.users.fetch(userId);
                    whitelistedUsers.push(`<@${userId}> (${user.tag})`);
                } catch (error) {
                    whitelistedUsers.push(`<@${userId}> (Unknown User)`);
                }
            }
            
            const listEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Whitelist')
                .setColor('#0099FF')
                .setDescription(whitelistedUsers.length > 0 
                    ? whitelistedUsers.join('\n') 
                    : 'No users are currently whitelisted.')
                .setFooter({ 
                    text: settings.website.name + ' | AntiNuke System', 
                    iconURL: settings.website.favicon 
                })
                .setTimestamp();
            
            return message.reply({ embeds: [listEmbed] });
        } else {
            // Show help
            const helpEmbed = createEmbed(
                'Whitelist Help',
                `**Usage:** ${settings.api.client.bot.prefix}whitelist <add|remove|list> [user]\n\n` +
                `**add <user>** - Add a user to the AntiNuke whitelist\n` +
                `**remove <user>** - Remove a user from the AntiNuke whitelist\n` +
                `**list** - List all whitelisted users`,
                '#0099FF'
            );
            
            return message.reply({ embeds: [helpEmbed] });
        }
    }
};
