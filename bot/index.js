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

// Load commands
try {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
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