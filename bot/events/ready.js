const { ActivityType } = require('discord.js');
const settings = require('../../settings.json');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`Bot is online! Logged in as ${client.user.tag}`);
        console.log(`Serving in ${client.guilds.cache.size} servers`);
        
        // Create a status rotation
        const activities = [
            { 
                name: `${settings.website.name}`, 
                type: ActivityType.Watching 
            },
            { 
                name: `/help for commands`, 
                type: ActivityType.Listening 
            },
            { 
                name: `${client.guilds.cache.size} server${client.guilds.cache.size !== 1 ? 's' : ''}`,
                type: ActivityType.Watching
            },
            {
                name: `${settings.website.url}`,
                type: ActivityType.Playing
            }
        ];
        
        let currentActivity = 0;
        
        // Set initial activity
        updateActivity();
        
        // Rotate status every 30 seconds
        setInterval(updateActivity, 30000);
        
        // Function to update the bot's activity
        function updateActivity() {
            const activity = activities[currentActivity];
            client.user.setActivity(activity.name, { type: activity.type });
            
            // Move to next activity in rotation
            currentActivity = (currentActivity + 1) % activities.length;
        }
    }
}; 