module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`Bot is online! Logged in as ${client.user.tag}`);
        console.log(`Serving in ${client.guilds.cache.size} servers`);
        
        // Set the bot's status
        client.user.setActivity('Flaxy Nodes', { type: 3 }); // 3 is for WATCHING
    }
}; 