const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load settings
const settings = require('../settings.json');

// Validate required settings
if (!settings.api || !settings.api.client || !settings.api.client.bot || !settings.api.client.bot.token) {
    console.error('Bot token not found in settings.json');
    throw new Error('Bot token not found in settings.json');
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Set up commands directory if it doesn't exist
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath, { recursive: true });
    console.log(`Created commands directory at ${commandsPath}`);
}

// Set up events directory if it doesn't exist
const eventsPath = path.join(__dirname, 'events');
if (!fs.existsSync(eventsPath)) {
    fs.mkdirSync(eventsPath, { recursive: true });
    console.log(`Created events directory at ${eventsPath}`);
}

// Set up data directory if it doesn't exist
const dataPath = path.join(__dirname, '../data');
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
    console.log(`Created data directory at ${dataPath}`);
}

// Function to recursively load commands from directories
function loadCommandsRecursively(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    // Files to ignore (utility files, not commands)
    const ignoreFiles = ['utils.js', 'events.js'];
    
    for (const item of items) {
        const itemPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
            // Check if this directory has an index.js file that exports commands
            const indexPath = path.join(itemPath, 'index.js');
            if (fs.existsSync(indexPath)) {
                try {
                    const module = require(indexPath);
                    
                    // If the module exports commands, register them
                    if (module.commands) {
                        for (const [name, command] of Object.entries(module.commands)) {
                            if ('data' in command && 'execute' in command) {
                                client.commands.set(command.data.name, command);
                                console.log(`Registered command from module: ${command.data.name}`);
                            }
                        }
                    }
                    
                    // If the module has an init function, call it
                    if (typeof module.initAntiNuke === 'function') {
                        module.initAntiNuke(client);
                    }
                } catch (error) {
                    console.error(`Error loading module from ${indexPath}:`, error);
                }
            } else {
                // If no index.js, recursively check for command files
                loadCommandsRecursively(itemPath);
            }
        } else if (item.name.endsWith('.js') && !ignoreFiles.includes(item.name)) {
            // Load individual command files (skip utility files)
            try {
                const command = require(itemPath);
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    console.log(`Registered command: ${command.data.name}`);
                } else {
                    console.log(`[WARNING] The command at ${itemPath} is missing a required "data" or "execute" property.`);
                }
            } catch (error) {
                console.error(`Error loading command from ${itemPath}:`, error);
            }
        }
    }
}

// Load commands
try {
    loadCommandsRecursively(commandsPath);
} catch (error) {
    console.error('Error loading commands:', error);
}

// Load events
try {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
} catch (error) {
    console.error('Error loading events:', error);
}

// Handle prefix commands
client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Check if message starts with the prefix
    const prefix = settings.api.client.bot.prefix;
    if (!message.content.startsWith(prefix)) return;
    
    // Extract command name and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    // Find the command
    const command = client.commands.find(cmd => {
        // Check if the command has a prefix property that matches
        if (cmd.prefix && cmd.prefix.split(' ')[0] === prefix + commandName) {
            return true;
        }
        return false;
    });
    
    if (!command) return;
    
    // Execute the prefix command handler if it exists
    if (typeof command.handlePrefix === 'function') {
        try {
            await command.handlePrefix(message, args);
        } catch (error) {
            console.error(`Error executing prefix command ${commandName}:`, error);
            message.reply('There was an error executing that command.').catch(console.error);
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(settings.api.client.bot.token)
    .then(() => {
        console.log('Bot successfully logged in to Discord!');
    })
    .catch(error => {
        console.error('Failed to log in to Discord:', error);
    });

module.exports = client;