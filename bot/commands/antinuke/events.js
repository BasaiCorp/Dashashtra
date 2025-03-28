const { Events, AuditLogEvent, PermissionsBitField } = require('discord.js');
const { getConfig, isWhitelisted, logEvent, applyPunishment } = require('./utils');

// Track recent bans for mass ban detection
const recentBans = new Map();

/**
 * Initialize antinuke event handlers
 * @param {object} client Discord.js client
 */
function initAntiNukeEvents(client) {
    // Channel Delete Protection
    client.on(Events.ChannelDelete, async channel => {
        const guild = channel.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.channelDelete) return;
        
        try {
            // Wait a moment for the audit log to be created
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Fetch the audit log
            const auditLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelDelete
            });
            
            // Get the executor
            const log = auditLogs.entries.first();
            if (!log) return;
            
            const executor = log.executor;
            
            // Skip if executor is the bot itself, server owner, or whitelisted
            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isWhitelisted(executor.id, config)
            ) return;
            
            // Log the event
            await logEvent(
                guild,
                config,
                'Channel Deletion Detected',
                `${executor.tag} (${executor.id}) deleted channel "${channel.name}". Taking action based on configured punishment.`
            );
            
            // Get the member object for the executor
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (!member) return;
            
            // Apply punishment
            await applyPunishment(
                guild,
                member,
                config,
                `Unauthorized channel deletion: ${channel.name}`
            );
            
            // Try to recreate the channel if possible
            try {
                const newChannel = await guild.channels.create({
                    name: channel.name,
                    type: channel.type,
                    parent: channel.parent,
                    permissionOverwrites: channel.permissionOverwrites.cache.toJSON()
                });
                
                await logEvent(
                    guild,
                    config,
                    'Channel Restored',
                    `Recreated deleted channel "${channel.name}" as "${newChannel.name}".`,
                    '#00FF00'
                );
            } catch (error) {
                console.error(`Error recreating channel in guild ${guild.id}:`, error);
                
                await logEvent(
                    guild,
                    config,
                    'Channel Restoration Failed',
                    `Failed to recreate deleted channel "${channel.name}". Manual restoration may be required.`,
                    '#FFA500'
                );
            }
        } catch (error) {
            console.error(`Error in channel delete protection for guild ${guild.id}:`, error);
        }
    });
    
    // Channel Create Protection
    client.on(Events.ChannelCreate, async channel => {
        const guild = channel.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.channelCreate) return;
        
        try {
            // Wait a moment for the audit log to be created
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Fetch the audit log
            const auditLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelCreate
            });
            
            // Get the executor
            const log = auditLogs.entries.first();
            if (!log) return;
            
            const executor = log.executor;
            
            // Skip if executor is the bot itself, server owner, or whitelisted
            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isWhitelisted(executor.id, config)
            ) return;
            
            // Log the event
            await logEvent(
                guild,
                config,
                'Suspicious Channel Creation',
                `${executor.tag} (${executor.id}) created channel "${channel.name}". Monitoring for potential nuke activity.`
            );
            
            // We don't immediately punish for channel creation, but we log it for awareness
            // This could be enhanced with rate limiting logic to detect mass channel creation
        } catch (error) {
            console.error(`Error in channel create protection for guild ${guild.id}:`, error);
        }
    });
    
    // Role Delete Protection
    client.on(Events.GuildRoleDelete, async role => {
        const guild = role.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.roleDelete) return;
        
        try {
            // Wait a moment for the audit log to be created
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Fetch the audit log
            const auditLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleDelete
            });
            
            // Get the executor
            const log = auditLogs.entries.first();
            if (!log) return;
            
            const executor = log.executor;
            
            // Skip if executor is the bot itself, server owner, or whitelisted
            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isWhitelisted(executor.id, config)
            ) return;
            
            // Log the event
            await logEvent(
                guild,
                config,
                'Role Deletion Detected',
                `${executor.tag} (${executor.id}) deleted role "${role.name}". Taking action based on configured punishment.`
            );
            
            // Get the member object for the executor
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (!member) return;
            
            // Apply punishment
            await applyPunishment(
                guild,
                member,
                config,
                `Unauthorized role deletion: ${role.name}`
            );
            
            // Try to recreate the role if possible
            try {
                const newRole = await guild.roles.create({
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    position: role.position,
                    permissions: role.permissions,
                    mentionable: role.mentionable
                });
                
                await logEvent(
                    guild,
                    config,
                    'Role Restored',
                    `Recreated deleted role "${role.name}" as "${newRole.name}".`,
                    '#00FF00'
                );
            } catch (error) {
                console.error(`Error recreating role in guild ${guild.id}:`, error);
                
                await logEvent(
                    guild,
                    config,
                    'Role Restoration Failed',
                    `Failed to recreate deleted role "${role.name}". Manual restoration may be required.`,
                    '#FFA500'
                );
            }
        } catch (error) {
            console.error(`Error in role delete protection for guild ${guild.id}:`, error);
        }
    });
    
    // Role Create Protection
    client.on(Events.GuildRoleCreate, async role => {
        const guild = role.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.roleCreate) return;
        
        try {
            // Wait a moment for the audit log to be created
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Fetch the audit log
            const auditLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleCreate
            });
            
            // Get the executor
            const log = auditLogs.entries.first();
            if (!log) return;
            
            const executor = log.executor;
            
            // Skip if executor is the bot itself, server owner, or whitelisted
            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isWhitelisted(executor.id, config)
            ) return;
            
            // Check if the role has dangerous permissions
            const dangerousPermissions = [
                PermissionsBitField.Flags.Administrator,
                PermissionsBitField.Flags.ManageGuild,
                PermissionsBitField.Flags.ManageRoles,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.BanMembers,
                PermissionsBitField.Flags.KickMembers
            ];
            
            const hasDangerousPermissions = dangerousPermissions.some(perm => role.permissions.has(perm));
            
            if (hasDangerousPermissions) {
                // Log the event
                await logEvent(
                    guild,
                    config,
                    'Dangerous Role Creation Detected',
                    `${executor.tag} (${executor.id}) created role "${role.name}" with dangerous permissions. Taking action based on configured punishment.`
                );
                
                // Get the member object for the executor
                const member = await guild.members.fetch(executor.id).catch(() => null);
                if (!member) return;
                
                // Apply punishment
                await applyPunishment(
                    guild,
                    member,
                    config,
                    `Created role with dangerous permissions: ${role.name}`
                );
                
                // Delete the dangerous role
                await role.delete('AntiNuke: Dangerous permissions detected').catch(console.error);
            } else {
                // Log non-dangerous role creation for awareness
                await logEvent(
                    guild,
                    config,
                    'Role Creation Detected',
                    `${executor.tag} (${executor.id}) created role "${role.name}". No dangerous permissions detected.`,
                    '#FFA500'
                );
            }
        } catch (error) {
            console.error(`Error in role create protection for guild ${guild.id}:`, error);
        }
    });
    
    // Bot Add Protection
    client.on(Events.GuildMemberAdd, async member => {
        const guild = member.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.botAdd) return;
        
        // Only check for bots
        if (!member.user.bot) return;
        
        try {
            // Wait a moment for the audit log to be created
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Fetch the audit log
            const auditLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.BotAdd
            });
            
            // Get the executor
            const log = auditLogs.entries.first();
            if (!log) return;
            
            const executor = log.executor;
            
            // Skip if executor is the bot itself, server owner, or whitelisted
            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isWhitelisted(executor.id, config)
            ) return;
            
            // Log the event
            await logEvent(
                guild,
                config,
                'Unauthorized Bot Addition',
                `${executor.tag} (${executor.id}) added bot "${member.user.tag}" to the server. Taking action based on configured punishment.`
            );
            
            // Get the member object for the executor
            const executorMember = await guild.members.fetch(executor.id).catch(() => null);
            if (executorMember) {
                // Apply punishment to the executor
                await applyPunishment(
                    guild,
                    executorMember,
                    config,
                    `Unauthorized bot addition: ${member.user.tag}`
                );
            }
            
            // Kick the bot
            await member.kick('AntiNuke: Unauthorized bot addition').catch(console.error);
            
            await logEvent(
                guild,
                config,
                'Bot Removed',
                `Removed unauthorized bot "${member.user.tag}" from the server.`,
                '#00FF00'
            );
        } catch (error) {
            console.error(`Error in bot add protection for guild ${guild.id}:`, error);
        }
    });
    
    // Member Admin Protection (Role Update)
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        const guild = newMember.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.memberAdmin) return;
        
        try {
            // Check if admin permissions were added
            const oldHasAdmin = oldMember.permissions.has(PermissionsBitField.Flags.Administrator);
            const newHasAdmin = newMember.permissions.has(PermissionsBitField.Flags.Administrator);
            
            // If admin permissions were added
            if (!oldHasAdmin && newHasAdmin) {
                // Wait a moment for the audit log to be created
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Fetch the audit log
                const auditLogs = await guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.MemberRoleUpdate
                });
                
                // Get the executor
                const log = auditLogs.entries.first();
                if (!log || log.target.id !== newMember.id) return;
                
                const executor = log.executor;
                
                // Skip if executor is the bot itself, server owner, or whitelisted
                if (
                    executor.id === client.user.id ||
                    executor.id === guild.ownerId ||
                    isWhitelisted(executor.id, config)
                ) return;
                
                // Log the event
                await logEvent(
                    guild,
                    config,
                    'Unauthorized Admin Granted',
                    `${executor.tag} (${executor.id}) gave administrative permissions to ${newMember.user.tag}. Taking action based on configured punishment.`
                );
                
                // Get the member object for the executor
                const executorMember = await guild.members.fetch(executor.id).catch(() => null);
                if (executorMember) {
                    // Apply punishment to the executor
                    await applyPunishment(
                        guild,
                        executorMember,
                        config,
                        `Unauthorized admin permissions granted to ${newMember.user.tag}`
                    );
                }
                
                // Revert the role changes if possible
                try {
                    // Find the admin role that was added
                    const addedAdminRoles = newMember.roles.cache
                        .filter(role => !oldMember.roles.cache.has(role.id) && role.permissions.has(PermissionsBitField.Flags.Administrator));
                    
                    for (const [_, role] of addedAdminRoles) {
                        await newMember.roles.remove(role, 'AntiNuke: Unauthorized admin role granted');
                    }
                    
                    await logEvent(
                        guild,
                        config,
                        'Admin Permissions Revoked',
                        `Successfully revoked unauthorized administrative permissions from ${newMember.user.tag}.`,
                        '#00FF00'
                    );
                } catch (error) {
                    console.error(`Error reverting role changes in guild ${guild.id}:`, error);
                    
                    await logEvent(
                        guild,
                        config,
                        'Role Reversion Failed',
                        `Failed to revoke unauthorized administrative permissions from ${newMember.user.tag}. Manual action may be required.`,
                        '#FFA500'
                    );
                }
            }
        } catch (error) {
            console.error(`Error in member admin protection for guild ${guild.id}:`, error);
        }
    });
    
    // Webhook Create Protection
    client.on(Events.WebhooksUpdate, async channel => {
        const guild = channel.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.webhookCreate) return;
        
        try {
            // Wait a moment for the audit log to be created
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Fetch the audit log
            const auditLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.WebhookCreate
            });
            
            // Get the executor
            const log = auditLogs.entries.first();
            if (!log) return;
            
            const executor = log.executor;
            const webhook = log.target;
            
            // Skip if executor is the bot itself, server owner, or whitelisted
            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isWhitelisted(executor.id, config)
            ) return;
            
            // Log the event
            await logEvent(
                guild,
                config,
                'Unauthorized Webhook Creation',
                `${executor.tag} (${executor.id}) created a webhook in channel ${channel}. Taking action based on configured punishment.`
            );
            
            // Get the member object for the executor
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                // Apply punishment
                await applyPunishment(
                    guild,
                    member,
                    config,
                    `Unauthorized webhook creation in ${channel.name}`
                );
            }
            
            // Delete the webhook
            try {
                // Fetch webhooks for the channel
                const webhooks = await channel.fetchWebhooks();
                
                // Find the webhook that was just created (should be the most recent one)
                const recentWebhook = webhooks.find(wh => wh.id === webhook.id);
                
                if (recentWebhook) {
                    await recentWebhook.delete('AntiNuke: Unauthorized webhook creation');
                    
                    await logEvent(
                        guild,
                        config,
                        'Webhook Deleted',
                        `Successfully deleted unauthorized webhook in ${channel}.`,
                        '#00FF00'
                    );
                }
            } catch (error) {
                console.error(`Error deleting webhook in guild ${guild.id}:`, error);
                
                await logEvent(
                    guild,
                    config,
                    'Webhook Deletion Failed',
                    `Failed to delete unauthorized webhook in ${channel}. Manual deletion may be required.`,
                    '#FFA500'
                );
            }
        } catch (error) {
            console.error(`Error in webhook create protection for guild ${guild.id}:`, error);
        }
    });
    
    // Mass Ban Protection
    client.on(Events.GuildBanAdd, async ban => {
        const guild = ban.guild;
        const config = getConfig(guild.id);
        
        // Skip if antinuke is disabled or this protection is disabled
        if (!config || !config.enabled || !config.protections.massban) return;
        
        try {
            // Wait a moment for the audit log to be created
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Fetch the audit log
            const auditLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberBanAdd
            });
            
            // Get the executor
            const log = auditLogs.entries.first();
            if (!log) return;
            
            const executor = log.executor;
            
            // Skip if executor is the bot itself, server owner, or whitelisted
            if (
                executor.id === client.user.id ||
                executor.id === guild.ownerId ||
                isWhitelisted(executor.id, config)
            ) return;
            
            // Track recent bans by this executor
            const now = Date.now();
            const executorBans = recentBans.get(executor.id) || [];
            
            // Remove bans outside the time window
            const recentExecutorBans = executorBans.filter(
                timestamp => now - timestamp < config.thresholds.timeWindow
            );
            
            // Add the current ban
            recentExecutorBans.push(now);
            recentBans.set(executor.id, recentExecutorBans);
            
            // Check if the threshold has been exceeded
            if (recentExecutorBans.length >= config.thresholds.massban) {
                // Log the event
                await logEvent(
                    guild,
                    config,
                    'Mass Ban Detected',
                    `${executor.tag} (${executor.id}) has banned ${recentExecutorBans.length} members in the last ${config.thresholds.timeWindow / 1000} seconds. Taking action based on configured punishment.`
                );
                
                // Get the member object for the executor
                const member = await guild.members.fetch(executor.id).catch(() => null);
                if (member) {
                    // Apply punishment
                    await applyPunishment(
                        guild,
                        member,
                        config,
                        `Mass ban detected: ${recentExecutorBans.length} bans in ${config.thresholds.timeWindow / 1000} seconds`
                    );
                }
                
                // Clear the ban tracking for this executor
                recentBans.delete(executor.id);
            }
        } catch (error) {
            console.error(`Error in mass ban protection for guild ${guild.id}:`, error);
        }
    });
}

module.exports = { initAntiNukeEvents };
