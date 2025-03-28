const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig, isAuthorized, createEmbed } = require('./utils');
const settings = require('../../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('extraowners')
        .setDescription('Manage additional owners for the AntiNuke system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user as an extra owner for the AntiNuke system')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to add as an extra owner')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from extra owners')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to remove from extra owners')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all extra owners'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // Command information for prefix command
    prefix: settings.api.client.bot.prefix + 'extraowners',
    description: 'Manage additional owners for the AntiNuke system',
    usage: 'add <user>|remove <user>|list',
    
    async execute(interaction) {
        // Get the guild
        const guild = interaction.guild;
        
        // Get the antinuke configuration
        const config = getConfig(guild.id);
        
        // Only the server owner can manage extra owners
        if (guild.ownerId !== interaction.user.id) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner can manage extra owners for the AntiNuke system.',
                '#FF0000'
            );
            
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        // Handle subcommands
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'add') {
            const user = interaction.options.getUser('user');
            
            // Check if user is already an extra owner
            if (config.extraOwners.includes(user.id)) {
                const alreadyEmbed = createEmbed(
                    'Already an Extra Owner', 
                    `${user.tag} is already designated as an extra owner.`,
                    '#FFA500'
                );
                
                return interaction.reply({ embeds: [alreadyEmbed], ephemeral: true });
            }
            
            // Add user to extra owners
            config.extraOwners.push(user.id);
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'Extra Owner Added', 
                `${user.tag} has been added as an extra owner. They can now manage the AntiNuke system.`,
                '#00FF00'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'remove') {
            const user = interaction.options.getUser('user');
            
            // Check if user is an extra owner
            if (!config.extraOwners.includes(user.id)) {
                const notEmbed = createEmbed(
                    'Not an Extra Owner', 
                    `${user.tag} is not designated as an extra owner.`,
                    '#FFA500'
                );
                
                return interaction.reply({ embeds: [notEmbed], ephemeral: true });
            }
            
            // Remove user from extra owners
            config.extraOwners = config.extraOwners.filter(id => id !== user.id);
            saveConfig(guild.id, config);
            
            const embed = createEmbed(
                'Extra Owner Removed', 
                `${user.tag} has been removed from extra owners. They can no longer manage the AntiNuke system.`,
                '#00FF00'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'list') {
            // Fetch user data for all extra owners
            const extraOwners = [];
            
            for (const userId of config.extraOwners) {
                try {
                    const user = await interaction.client.users.fetch(userId);
                    extraOwners.push(`<@${userId}> (${user.tag})`);
                } catch (error) {
                    extraOwners.push(`<@${userId}> (Unknown User)`);
                }
            }
            
            const listEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Extra Owners')
                .setColor('#0099FF')
                .setDescription(extraOwners.length > 0 
                    ? extraOwners.join('\n') 
                    : 'No extra owners are currently designated.')
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
        
        // Only the server owner can manage extra owners
        if (guild.ownerId !== message.author.id) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner can manage extra owners for the AntiNuke system.',
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
                    `Please specify a user to add as an extra owner.\n\n**Usage:** ${settings.api.client.bot.prefix}extraowners add <user>`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            try {
                const user = await message.client.users.fetch(userId);
                
                // Check if user is already an extra owner
                if (config.extraOwners.includes(user.id)) {
                    const alreadyEmbed = createEmbed(
                        'Already an Extra Owner', 
                        `${user.tag} is already designated as an extra owner.`,
                        '#FFA500'
                    );
                    
                    return message.reply({ embeds: [alreadyEmbed] });
                }
                
                // Add user to extra owners
                config.extraOwners.push(user.id);
                saveConfig(guild.id, config);
                
                const embed = createEmbed(
                    'Extra Owner Added', 
                    `${user.tag} has been added as an extra owner. They can now manage the AntiNuke system.`,
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
                    `Please specify a user to remove from extra owners.\n\n**Usage:** ${settings.api.client.bot.prefix}extraowners remove <user>`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            try {
                const user = await message.client.users.fetch(userId);
                
                // Check if user is an extra owner
                if (!config.extraOwners.includes(user.id)) {
                    const notEmbed = createEmbed(
                        'Not an Extra Owner', 
                        `${user.tag} is not designated as an extra owner.`,
                        '#FFA500'
                    );
                    
                    return message.reply({ embeds: [notEmbed] });
                }
                
                // Remove user from extra owners
                config.extraOwners = config.extraOwners.filter(id => id !== user.id);
                saveConfig(guild.id, config);
                
                const embed = createEmbed(
                    'Extra Owner Removed', 
                    `${user.tag} has been removed from extra owners. They can no longer manage the AntiNuke system.`,
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
            // Fetch user data for all extra owners
            const extraOwners = [];
            
            for (const userId of config.extraOwners) {
                try {
                    const user = await message.client.users.fetch(userId);
                    extraOwners.push(`<@${userId}> (${user.tag})`);
                } catch (error) {
                    extraOwners.push(`<@${userId}> (Unknown User)`);
                }
            }
            
            const listEmbed = new EmbedBuilder()
                .setTitle('🛡️ AntiNuke Extra Owners')
                .setColor('#0099FF')
                .setDescription(extraOwners.length > 0 
                    ? extraOwners.join('\n') 
                    : 'No extra owners are currently designated.')
                .setFooter({ 
                    text: settings.website.name + ' | AntiNuke System', 
                    iconURL: settings.website.favicon 
                })
                .setTimestamp();
            
            return message.reply({ embeds: [listEmbed] });
        } else {
            // Show help
            const helpEmbed = createEmbed(
                'Extra Owners Help',
                `**Usage:** ${settings.api.client.bot.prefix}extraowners <add|remove|list> [user]\n\n` +
                `**add <user>** - Add a user as an extra owner for the AntiNuke system\n` +
                `**remove <user>** - Remove a user from extra owners\n` +
                `**list** - List all extra owners`,
                '#0099FF'
            );
            
            return message.reply({ embeds: [helpEmbed] });
        }
    }
};
