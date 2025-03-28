const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig, isAuthorized, createEmbed } = require('./utils');
const settings = require('../../../settings.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('punishment')
        .setDescription('Configure punishment settings for the AntiNuke system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the punishment type for AntiNuke violations')
                .addStringOption(option => 
                    option.setName('type')
                        .setDescription('The type of punishment to apply')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ban', value: 'ban' },
                            { name: 'Kick', value: 'kick' },
                            { name: 'Strip Roles', value: 'strip' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current punishment settings'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // Command information for prefix command
    prefix: settings.api.client.bot.prefix + 'punishment',
    description: 'Configure punishment settings for the AntiNuke system',
    usage: 'set <ban|kick|strip>|view',
    
    async execute(interaction) {
        // Get the guild
        const guild = interaction.guild;
        
        // Get the antinuke configuration
        const config = getConfig(guild.id);
        
        // Check if the user is authorized (server owner or extra owner)
        if (!isAuthorized(guild, interaction.user, config)) {
            const errorEmbed = createEmbed(
                'Permission Denied', 
                'Only the server owner or designated extra owners can manage the AntiNuke punishment settings.',
                '#FF0000'
            );
            
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        // Handle subcommands
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
            const punishmentType = interaction.options.getString('type');
            
            // Update the punishment type
            config.punishment = punishmentType;
            saveConfig(guild.id, config);
            
            // Get a description of the punishment
            let description;
            switch (punishmentType) {
                case 'ban':
                    description = 'Users who trigger the AntiNuke system will be **banned** from the server.';
                    break;
                case 'kick':
                    description = 'Users who trigger the AntiNuke system will be **kicked** from the server.';
                    break;
                case 'strip':
                    description = 'Users who trigger the AntiNuke system will have their **administrative roles removed**.';
                    break;
            }
            
            const embed = createEmbed(
                'Punishment Updated', 
                `The AntiNuke punishment has been set to **${punishmentType}**.\n\n${description}`,
                '#00FF00'
            );
            
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'view') {
            // Get a description of the current punishment
            let description;
            switch (config.punishment) {
                case 'ban':
                    description = 'Users who trigger the AntiNuke system will be **banned** from the server.';
                    break;
                case 'kick':
                    description = 'Users who trigger the AntiNuke system will be **kicked** from the server.';
                    break;
                case 'strip':
                    description = 'Users who trigger the AntiNuke system will have their **administrative roles removed**.';
                    break;
            }
            
            const embed = createEmbed(
                'Current Punishment', 
                `The AntiNuke punishment is currently set to **${config.punishment}**.\n\n${description}`,
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
                'Only the server owner or designated extra owners can manage the AntiNuke punishment settings.',
                '#FF0000'
            );
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        // Check for subcommand
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'set') {
            const punishmentType = args[1]?.toLowerCase();
            
            // Validate punishment type
            if (!punishmentType || !['ban', 'kick', 'strip'].includes(punishmentType)) {
                const helpEmbed = createEmbed(
                    'Invalid Punishment Type', 
                    `Please specify a valid punishment type: ban, kick, or strip.\n\n**Usage:** ${settings.api.client.bot.prefix}punishment set <ban|kick|strip>`,
                    '#FFA500'
                );
                
                return message.reply({ embeds: [helpEmbed] });
            }
            
            // Update the punishment type
            config.punishment = punishmentType;
            saveConfig(guild.id, config);
            
            // Get a description of the punishment
            let description;
            switch (punishmentType) {
                case 'ban':
                    description = 'Users who trigger the AntiNuke system will be **banned** from the server.';
                    break;
                case 'kick':
                    description = 'Users who trigger the AntiNuke system will be **kicked** from the server.';
                    break;
                case 'strip':
                    description = 'Users who trigger the AntiNuke system will have their **administrative roles removed**.';
                    break;
            }
            
            const embed = createEmbed(
                'Punishment Updated', 
                `The AntiNuke punishment has been set to **${punishmentType}**.\n\n${description}`,
                '#00FF00'
            );
            
            return message.reply({ embeds: [embed] });
        } else if (subcommand === 'view') {
            // Get a description of the current punishment
            let description;
            switch (config.punishment) {
                case 'ban':
                    description = 'Users who trigger the AntiNuke system will be **banned** from the server.';
                    break;
                case 'kick':
                    description = 'Users who trigger the AntiNuke system will be **kicked** from the server.';
                    break;
                case 'strip':
                    description = 'Users who trigger the AntiNuke system will have their **administrative roles removed**.';
                    break;
            }
            
            const embed = createEmbed(
                'Current Punishment', 
                `The AntiNuke punishment is currently set to **${config.punishment}**.\n\n${description}`,
                '#0099FF'
            );
            
            return message.reply({ embeds: [embed] });
        } else {
            // Show help
            const helpEmbed = createEmbed(
                'Punishment Help',
                `**Usage:** ${settings.api.client.bot.prefix}punishment <set|view> [type]\n\n` +
                `**set <type>** - Set the punishment type for AntiNuke violations (ban, kick, or strip)\n` +
                `**view** - View the current punishment settings`,
                '#0099FF'
            );
            
            return message.reply({ embeds: [helpEmbed] });
        }
    }
};
