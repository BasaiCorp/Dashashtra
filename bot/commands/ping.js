const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with the bot latency'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const ping = sent.createdTimestamp - interaction.createdTimestamp;
        
        await interaction.editReply(`Pong! Latency: ${ping}ms | API Latency: ${Math.round(interaction.client.ws.ping)}ms`);
    },
}; 