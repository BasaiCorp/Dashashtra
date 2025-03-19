const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settings = require('../../settings.json');
const utils = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('plan')
        .setDescription('Shows your current subscription plan and expiry date'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get the main application and database
            const indexjs = require('../../index.js');
            const db = indexjs.db;
            
            // Get Discord ID from the interaction
            const discordId = interaction.user.id;
            
            // Find user with matching Discord ID
            const user = await db.users.getUserByDiscordId(discordId);
            
            if (!user) {
                const errorEmbed = utils.createErrorEmbed(
                    'Account Not Found',
                    `You're not linked to any account on ${settings.website.name}. Please login with Discord on our dashboard to link your account.`,
                    interaction.user
                );
                
                // Create button to dashboard
                const dashboardButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Login with Discord')
                            .setStyle(ButtonStyle.Link)
                            .setURL(settings.website.url)
                    );
                
                return interaction.editReply({ 
                    embeds: [errorEmbed],
                    components: [dashboardButton],
                    ephemeral: true 
                });
            }
            
            // Get user's package info
            const package = await db.packages.getUserPackage(user.id);
            const packageName = package ? package.name : settings.api.client.packages.default;
            const packageData = settings.api.client.packages.list[packageName];
            
            // Get user subscription details
            const subscription = await db.subscriptions.getUserSubscription(user.id);
            
            // Format expiry date or set to "No subscription"
            let expiryDate = "No active subscription";
            let renewalInfo = "Not available";
            let statusText = "❌ Inactive";
            let statusColor = 0xFF5555; // Red
            
            if (subscription && subscription.expires) {
                const expiry = new Date(subscription.expires);
                expiryDate = `<t:${Math.floor(expiry.getTime() / 1000)}:F>`;
                renewalInfo = `<t:${Math.floor(expiry.getTime() / 1000)}:R>`;
                
                const now = new Date();
                if (expiry > now) {
                    statusText = "✅ Active";
                    statusColor = 0x55AA55; // Green
                    
                    // If expiry is within 7 days
                    if (expiry.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000) {
                        statusText = "⚠️ Expiring Soon";
                        statusColor = 0xFFAA00; // Amber
                    }
                } else {
                    statusText = "❌ Expired";
                    statusColor = 0xFF5555; // Red
                }
            }
            
            // Create plan features list
            const features = Object.entries(packageData).map(([key, value]) => {
                if (key === 'name' || key === 'price') return null;
                
                // Format the key
                let formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                
                // Format the value based on the key
                let formattedValue = value;
                if (key === 'ram' || key === 'disk') {
                    formattedValue = `${value} MB`;
                } else if (key === 'cpu') {
                    formattedValue = `${value}%`;
                } else if (typeof value === 'boolean') {
                    formattedValue = value ? '✅' : '❌';
                }
                
                return `**${formattedKey}**: ${formattedValue}`;
            }).filter(item => item !== null).join('\n');
            
            // Create price display
            const priceDisplay = packageData.price > 0 
                ? `$${packageData.price.toFixed(2)}/month` 
                : "Free";
            
            // Create plan embed
            const planEmbed = new EmbedBuilder()
                .setColor(statusColor)
                .setTitle(`${user.username || user.email.split('@')[0]}'s Subscription`)
                .setDescription(`Your current plan information for ${settings.website.name}`)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '📋 Plan', value: packageName, inline: true },
                    { name: '💰 Price', value: priceDisplay, inline: true },
                    { name: '📊 Status', value: statusText, inline: true },
                    { name: '📅 Expiry Date', value: expiryDate, inline: true },
                    { name: '🔄 Renewal', value: renewalInfo, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: '✨ Plan Features', value: features, inline: false },
                    utils.createDashboardLinks()
                )
                .setFooter(utils.createFooter('Subscription Info', interaction.user))
                .setTimestamp();
            
            // Create buttons for dashboard and renewal
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(settings.website.url),
                    new ButtonBuilder()
                        .setLabel('Renew Plan')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`${settings.website.url}/store`),
                    new ButtonBuilder()
                        .setCustomId('refresh_plan')
                        .setLabel('Refresh')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );
            
            const response = await interaction.editReply({
                embeds: [planEmbed],
                components: [row],
                ephemeral: true,
                fetchReply: true
            });
            
            // Create a collector for button interactions
            const collector = response.createMessageComponentCollector({ 
                time: 60000 // 60 seconds
            });
            
            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'This button is not for you!', ephemeral: true });
                }
                
                if (i.customId === 'refresh_plan') {
                    // Re-fetch all data for refresh
                    const refreshedUser = await db.users.getUserByDiscordId(discordId);
                    const refreshedPackage = await db.packages.getUserPackage(refreshedUser.id);
                    const refreshedSubscription = await db.subscriptions.getUserSubscription(refreshedUser.id);
                    
                    // Update package information
                    const refreshedPackageName = refreshedPackage ? refreshedPackage.name : settings.api.client.packages.default;
                    const refreshedPackageData = settings.api.client.packages.list[refreshedPackageName];
                    
                    // Update expiry information
                    let newExpiryDate = "No active subscription";
                    let newRenewalInfo = "Not available";
                    let newStatusText = "❌ Inactive";
                    let newStatusColor = 0xFF5555; // Red
                    
                    if (refreshedSubscription && refreshedSubscription.expires) {
                        const expiry = new Date(refreshedSubscription.expires);
                        newExpiryDate = `<t:${Math.floor(expiry.getTime() / 1000)}:F>`;
                        newRenewalInfo = `<t:${Math.floor(expiry.getTime() / 1000)}:R>`;
                        
                        const now = new Date();
                        if (expiry > now) {
                            newStatusText = "✅ Active";
                            newStatusColor = 0x55AA55; // Green
                            
                            // If expiry is within 7 days
                            if (expiry.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000) {
                                newStatusText = "⚠️ Expiring Soon";
                                newStatusColor = 0xFFAA00; // Amber
                            }
                        } else {
                            newStatusText = "❌ Expired";
                            newStatusColor = 0xFF5555; // Red
                        }
                    }
                    
                    // Update features list
                    const newFeatures = Object.entries(refreshedPackageData).map(([key, value]) => {
                        if (key === 'name' || key === 'price') return null;
                        
                        // Format the key
                        let formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                        
                        // Format the value based on the key
                        let formattedValue = value;
                        if (key === 'ram' || key === 'disk') {
                            formattedValue = `${value} MB`;
                        } else if (key === 'cpu') {
                            formattedValue = `${value}%`;
                        } else if (typeof value === 'boolean') {
                            formattedValue = value ? '✅' : '❌';
                        }
                        
                        return `**${formattedKey}**: ${formattedValue}`;
                    }).filter(item => item !== null).join('\n');
                    
                    // Create price display
                    const newPriceDisplay = refreshedPackageData.price > 0 
                        ? `$${refreshedPackageData.price.toFixed(2)}/month` 
                        : "Free";
                    
                    // Create updated embed
                    const updatedEmbed = new EmbedBuilder()
                        .setColor(newStatusColor)
                        .setTitle(`${refreshedUser.username || refreshedUser.email.split('@')[0]}'s Subscription`)
                        .setDescription(`Your current plan information for ${settings.website.name}`)
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: '📋 Plan', value: refreshedPackageName, inline: true },
                            { name: '💰 Price', value: newPriceDisplay, inline: true },
                            { name: '📊 Status', value: newStatusText, inline: true },
                            { name: '📅 Expiry Date', value: newExpiryDate, inline: true },
                            { name: '🔄 Renewal', value: newRenewalInfo, inline: true },
                            { name: '\u200B', value: '\u200B', inline: true },
                            { name: '✨ Plan Features', value: newFeatures, inline: false },
                            utils.createDashboardLinks()
                        )
                        .setFooter(utils.createFooter('Subscription Info', interaction.user))
                        .setTimestamp();
                    
                    await i.update({ embeds: [updatedEmbed], components: [row] });
                }
            });
            
            collector.on('end', () => {
                // Disable buttons when collector expires
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Dashboard')
                            .setStyle(ButtonStyle.Link)
                            .setURL(settings.website.url),
                        new ButtonBuilder()
                            .setLabel('Renew Plan')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`${settings.website.url}/store`),
                        new ButtonBuilder()
                            .setCustomId('refresh_plan')
                            .setLabel('Refresh')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🔄')
                            .setDisabled(true)
                    );
                
                interaction.editReply({ 
                    embeds: [planEmbed], 
                    components: [disabledRow] 
                }).catch(console.error);
            });
            
        } catch (error) {
            console.error('Error in plan command:', error);
            const errorEmbed = utils.createErrorEmbed(
                'Error',
                'An error occurred while fetching your subscription information.',
                interaction.user
            );
            
            await interaction.editReply({ 
                embeds: [errorEmbed],
                ephemeral: true 
            });
        }
    },
}; 