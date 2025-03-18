const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const settings = require('../settings.json');

/**
 * Deploys bot commands to Discord
 * @returns {Promise<Array>} Array of deployed commands
 */
async function deployCommands() {
    // Validate settings
    if (!settings.api || !settings.api.client || !settings.api.client.bot || !settings.api.client.bot.token) {
        throw new Error('Bot token not found in settings.json');
    }
    
    if (!settings.discord || !settings.discord.client_id) {
        throw new Error('Discord client_id not found in settings.json');
    }
    
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    
    // Check if commands directory exists
    if (!fs.existsSync(commandsPath)) {
        console.log('[WARNING] Commands directory not found, creating it');
        fs.mkdirSync(commandsPath, { recursive: true });
    }
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    const rest = new REST().setToken(settings.api.client.bot.token);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Safely get the guild ID
        const guildId = settings.api.client.bot.guildId || 
                        (settings.discord && settings.discord.guild_id) || 
                        "1338843953520443407"; // Fallback ID

        // The put method is used to fully refresh all commands
        const data = await rest.put(
            Routes.applicationGuildCommands(settings.discord.client_id, guildId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        return data;
    } catch (error) {
        console.error('Error deploying commands:', error);
        throw error;
    }
}

// Export the function for use in other files
module.exports = deployCommands;

// If this file is run directly, deploy the commands
if (require.main === module) {
    deployCommands()
        .catch(error => {
            console.error('Failed to deploy commands:', error);
            process.exit(1);
        });
} 