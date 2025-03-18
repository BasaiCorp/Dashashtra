const express = require('express');
const router = express.Router();

// Check if we're in demo mode
const isDemoMode = () => {
    return process.env.DEMO_MODE === 'true' || 
           !require('../settings.json').pterodactyl.domain || 
           require('../settings.json').pterodactyl.domain.includes('offline');
};

// Only import discord.js if not in demo mode to avoid the ReadableStream error
let client = null;
let discordModule = null;

// Initialize bot with mock functionality in demo mode
async function initializeBot(database) {
    const settings = require('../settings.json');
    
    if (isDemoMode()) {
        console.log("[BOT] Running in demo mode, Discord bot disabled");
        
        // Create mock client for demo mode
        client = {
            user: { tag: 'DemoBot#0000', setActivity: () => {} },
            on: () => {},
            login: () => Promise.resolve(),
            guilds: { cache: new Map() }
        };
        
        return;
    }
    
    try {
        // Only import discord.js if not in demo mode
        const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
        discordModule = { Client, GatewayIntentBits, ActivityType };
        
        if (!settings.api.client.bot.token) {
            console.warn("[BOT] Warning: Bot token not configured in settings.json");
            return;
        }
        
        client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        client.on('ready', () => {
            console.log(`[BOT] Logged in as ${client.user.tag}`);
            
            // Set bot status
            client.user.setActivity('with Dashactyl', { type: ActivityType.Playing });
        });

        // Handle commands
        client.on('messageCreate', async message => {
            if (message.author.bot) return;
            if (!message.guild) return;

            const prefix = settings.api.client.bot.prefix || '!';
            if (!message.content.startsWith(prefix)) return;

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // Example command: !stats
            if (command === 'stats') {
                const userCount = await database.get('users') || [];
                message.reply({
                    embeds: [{
                        title: 'Dashboard Statistics',
                        description: `Total Users: ${userCount.length}`,
                        color: 0x3498db
                    }]
                });
            }

            // Example command: !help
            if (command === 'help') {
                message.reply({
                    embeds: [{
                        title: 'Bot Commands',
                        description: `
                            ${prefix}stats - Show dashboard statistics
                            ${prefix}help - Show this help message
                        `,
                        color: 0x2ecc71
                    }]
                });
            }
        });

        // Login to Discord
        try {
            await client.login(settings.api.client.bot.token);
        } catch (error) {
            console.error('[BOT] Failed to login:', error.message);
        }
    } catch (error) {
        console.error('[BOT] Error initializing Discord bot:', error.message);
        
        // Create mock client if discord.js fails to load
        client = {
            user: { tag: 'ErrorBot#0000', setActivity: () => {} },
            on: () => {},
            login: () => Promise.resolve(),
            guilds: { cache: new Map() }
        };
    }
}

// Export router and load function
module.exports = {
    router: router,
    load: async function(app, database) {
        try {
            await initializeBot(database);
        } catch (error) {
            console.error('[BOT] Failed to initialize:', error);
        }
        return router;
    },
    // Return mock client for demo mode or real client otherwise
    get client() {
        return client;
    }
};