const { initAntiNukeEvents } = require('./events');
const fs = require('fs');
const path = require('path');

// Create a collection of antinuke commands
const antinukeCommands = {};

// Load all command files
const commandFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.js') && file !== 'index.js' && file !== 'utils.js' && file !== 'events.js');

for (const file of commandFiles) {
    const command = require(`./${file}`);
    const commandName = file.replace('.js', '');
    antinukeCommands[commandName] = command;
}

/**
 * Initialize the antinuke system
 * @param {object} client Discord.js client
 */
function initAntiNuke(client) {
    console.log('Initializing AntiNuke system...');
    
    // Initialize event handlers
    initAntiNukeEvents(client);
    
    console.log('AntiNuke system initialized successfully.');
}

module.exports = {
    commands: antinukeCommands,
    initAntiNuke
};
