const Discord = require('discord.js');
const settings = require('./settings.json');
const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers
    ]
});

let db;

module.exports.load = async function(app, database) {
    db = database;
    
    if (!settings.api.client.bot.token) {
        console.warn("[BOT] Warning: Bot token not configured in settings.json");
        return;
    }

    client.on('ready', () => {
        console.log(`[BOT] Logged in as ${client.user.tag}`);
        
        // Set bot status
        client.user.setActivity('with Dashactyl', { type: Discord.ActivityType.Playing });
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
            const userCount = await db.get('users') || [];
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
};

// Export the client for use in other files
module.exports.client = client;