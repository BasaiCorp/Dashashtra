const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

// Load settings from settings.json
function getSettings() {
    try {
        const settingsPath = path.join(process.cwd(), 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return settings;
    } catch (error) {
        console.error('Error loading settings:', error);
        throw new Error('Failed to load settings');
    }
}

class PterodactylAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        const settings = getSettings();
        this.domain = settings.pterodactyl?.domain;
        
        if (!this.domain) {
            throw new Error('Pterodactyl domain not configured in settings.json');
        }

        this.client = axios.create({
            baseURL: this.domain,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    async getUserInfo() {
        try {
            const response = await this.client.get('/api/client/account');
            return response.data;
        } catch (error) {
            console.error('Error fetching user info:', error);
            throw error;
        }
    }

    async updateUserInfo(data) {
        try {
            const response = await this.client.patch('/api/client/account', data);
            return response.data;
        } catch (error) {
            console.error('Error updating user info:', error);
            throw error;
        }
    }

    async updateEmail(email) {
        try {
            const response = await this.client.patch('/api/client/account/email', { email });
            return response.data;
        } catch (error) {
            console.error('Error updating email:', error);
            throw error;
        }
    }

    async updatePassword(currentPassword, newPassword) {
        try {
            const response = await this.client.patch('/api/client/account/password', {
                current_password: currentPassword,
                password: newPassword,
                password_confirmation: newPassword
            });
            return response.data;
        } catch (error) {
            console.error('Error updating password:', error);
            throw error;
        }
    }
}

// Database operations
async function updateLocalUser(userId, data) {
    try {
        // Parse notification preferences if it's an object
        if (typeof data.notificationPreferences === 'object') {
            data.notificationPreferences = JSON.stringify(data.notificationPreferences);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                username: data.username,
                email: data.email,
                panelApiKey: data.panelApiKey,
                discordId: data.discordId,
                discordUsername: data.discordUsername,
                discordAvatar: data.discordAvatar,
                discordDiscriminator: data.discordDiscriminator,
                notificationPreferences: data.notificationPreferences,
                twoFactorEnabled: data.twoFactorEnabled,
                lastUpdated: new Date()
            }
        });

        // Parse notification preferences back to object
        if (updatedUser.notificationPreferences) {
            updatedUser.notificationPreferences = JSON.parse(updatedUser.notificationPreferences);
        }

        return updatedUser;
    } catch (error) {
        console.error('Error updating local user:', error);
        throw error;
    }
}

async function getLocalUser(userId) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        // Parse notification preferences if it exists
        if (user?.notificationPreferences) {
            user.notificationPreferences = JSON.parse(user.notificationPreferences);
        }

        return user;
    } catch (error) {
        console.error('Error fetching local user:', error);
        throw error;
    }
}

// Main functions for API routes
async function fetchAndSyncUserInfo(userId, panelApiKey) {
    try {
        // Get local user data
        const localUser = await getLocalUser(userId);
        if (!localUser) {
            throw new Error('User not found in local database');
        }

        // Initialize Pterodactyl API client
        const pterodactyl = new PterodactylAPI(panelApiKey);

        // Fetch user info from Pterodactyl
        const panelUser = await pterodactyl.getUserInfo();

        // Merge and update local data
        const updatedData = {
            ...localUser,
            username: panelUser.username,
            email: panelUser.email,
            panelApiKey: panelApiKey,
            lastPanelSync: new Date()
        };

        // Update local database
        const updatedUser = await updateLocalUser(userId, updatedData);

        return {
            success: true,
            data: updatedUser
        };
    } catch (error) {
        console.error('Error in fetchAndSyncUserInfo:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function updateUserSettings(userId, settings) {
    try {
        // Get local user data
        const localUser = await getLocalUser(userId);
        if (!localUser) {
            throw new Error('User not found in local database');
        }

        // If panel API key exists, update Pterodactyl
        if (localUser.panelApiKey) {
            const pterodactyl = new PterodactylAPI(localUser.panelApiKey);
            
            // Update email if changed
            if (settings.email && settings.email !== localUser.email) {
                await pterodactyl.updateEmail(settings.email);
            }

            // Update password if provided
            if (settings.currentPassword && settings.newPassword) {
                await pterodactyl.updatePassword(settings.currentPassword, settings.newPassword);
            }
        }

        // Update local database
        const updatedUser = await updateLocalUser(userId, {
            ...localUser,
            ...settings,
            lastUpdated: new Date()
        });

        return {
            success: true,
            data: updatedUser
        };
    } catch (error) {
        console.error('Error in updateUserSettings:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    fetchAndSyncUserInfo,
    updateUserSettings,
    PterodactylAPI
}; 