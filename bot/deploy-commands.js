const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const settings = require('../settings.json');
const chalk = require('chalk');

/**
 * Deploys bot commands to Discord
 * @returns {Promise<Array>} Array of deployed commands
 */
async function deployCommands() {
    // Validate settings
    if (!settings.api || !settings.api.client || !settings.api.client.bot || !settings.api.client.bot.token) {
        console.error(chalk.red('[BOT] Error: Bot token not found in settings.json'));
        throw new Error('Bot token not found in settings.json');
    }
    
    if (!settings.discord || !settings.discord.client_id) {
        console.error(chalk.red('[BOT] Error: Discord client_id not found in settings.json'));
        throw new Error('Discord client_id not found in settings.json');
    }

    try {
        console.log(chalk.blue('[BOT] Loading commands from directory...'));
        
        const commands = [];
        const commandsPath = path.join(__dirname, 'commands');
        
        // Check if commands directory exists
        if (!fs.existsSync(commandsPath)) {
            console.log(chalk.yellow('[BOT] Commands directory not found, creating it'));
            fs.mkdirSync(commandsPath, { recursive: true });
        }
        
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        console.log(chalk.blue(`[BOT] Found ${commandFiles.length} command files`));

        // Load each command file
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                    console.log(chalk.green(`[BOT] Loaded command: ${command.data.name}`));
                } else {
                    console.log(chalk.yellow(`[BOT] The command at ${filePath} is missing a required "data" or "execute" property.`));
                }
            } catch (error) {
                console.error(chalk.red(`[BOT] Error loading command from ${filePath}:`), error);
            }
        }

        if (commands.length === 0) {
            console.log(chalk.yellow('[BOT] No commands found to deploy'));
            return [];
        }

        const rest = new REST().setToken(settings.api.client.bot.token);

        console.log(chalk.blue(`[BOT] Started refreshing ${commands.length} application (/) commands.`));

        // Determine guild ID with proper fallbacks
        const guildId = 
            settings.api.client.bot.guildId || 
            settings.discord.guild_id || 
            (settings.api.client.bot.joinguild && settings.api.client.bot.joinguild.guildid && 
                settings.api.client.bot.joinguild.guildid[0]);
        
        if (!guildId) {
            console.error(chalk.red('[BOT] No guild ID found for command deployment'));
            throw new Error('No guild ID found for command deployment');
        }

        console.log(chalk.blue(`[BOT] Deploying commands to guild ID: ${guildId}`));

        // Deploy commands
        try {
            const data = await rest.put(
                Routes.applicationGuildCommands(settings.discord.client_id, guildId),
                { body: commands },
            );

            console.log(chalk.green(`[BOT] Successfully reloaded ${data.length} application (/) commands.`));
            return data;
        } catch (error) {
            console.error(chalk.red('[BOT] Error deploying commands:'), error);
            
            // If the error is about the guild not being found, provide a helpful message
            if (error.message.includes('Unknown Guild')) {
                console.error(chalk.red(`[BOT] The guild ID ${guildId} is invalid or the bot is not a member of this guild.`));
                console.error(chalk.yellow('[BOT] Make sure the bot is invited to the guild before deploying commands.'));
            }
            
            throw error;
        }
    } catch (error) {
        console.error(chalk.red('[BOT] Error in deployCommands function:'), error);
        throw error;
    }
}

// Export the function for use in other files
module.exports = deployCommands;

// If this file is run directly, deploy the commands
if (require.main === module) {
    deployCommands()
        .then(() => {
            console.log(chalk.green('[BOT] Command deployment complete'));
            process.exit(0);
        })
        .catch(error => {
            console.error(chalk.red('[BOT] Failed to deploy commands:'), error);
            process.exit(1);
        });
} 