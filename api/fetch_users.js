const settings = require("../settings.json");
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const express = require('express');
const router = express.Router();

// Make sure cache directory exists
const cacheDir = path.join(__dirname, '../cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

const USER_CACHE_FILE = path.join(cacheDir, 'users_cache.json');
const CACHE_TTL = 300000; // 5 minutes in milliseconds

// Initialize module
console.log('[USERS] Initializing user fetcher module...');

/**
 * Get all users from Pterodactyl panel
 * @param {boolean} forceUpdate - Force cache update
 * @returns {Promise<Array>} - Array of user objects
 */
async function getUsers(forceUpdate = false) {
    try {
        // Check if cache exists and is valid
        if (!forceUpdate && fs.existsSync(USER_CACHE_FILE)) {
            const cacheStats = fs.statSync(USER_CACHE_FILE);
            const cacheAge = Date.now() - cacheStats.mtimeMs;
            
            // If cache is still valid, use it
            if (cacheAge < CACHE_TTL) {
                const cacheData = JSON.parse(fs.readFileSync(USER_CACHE_FILE, 'utf8'));
                console.log('[USERS] Using cached user data');
                return cacheData;
            }
        }
        
        // Update cache
        return await updateCache();
    } catch (error) {
        console.error(chalk.red('[USERS] Error getting users:'), error);
        // If cache exists but is outdated, still use it as fallback
        if (fs.existsSync(USER_CACHE_FILE)) {
            console.log(chalk.yellow('[USERS] Using outdated cache as fallback'));
            return JSON.parse(fs.readFileSync(USER_CACHE_FILE, 'utf8'));
        }
        return [];
    }
}

/**
 * Get a single user by ID
 * @param {string} userId - Pterodactyl user ID
 * @returns {Promise<object|null>} - User object or null if not found
 */
async function getUserById(userId) {
    try {
        console.log(`[USERS] Fetching user ${userId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/users/${userId}?include=servers`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to fetch user: ${response.status} ${response.statusText}`);
        }
        
        const userData = await response.json();
        return userData.attributes;
    } catch (error) {
        console.error(chalk.red(`[USERS] Error fetching user ${userId}:`), error);
        return null;
    }
}

/**
 * Update the users cache
 * @returns {Promise<Array>} - Array of user objects
 */
async function updateCache() {
    console.log('[USERS] Updating users cache...');
    
    try {
        let allUsers = [];
        let currentPage = 1;
        let hasNextPage = true;
        
        // Pterodactyl uses pagination, so we need to fetch all pages
        while (hasNextPage) {
            const response = await fetch(
                `${settings.pterodactyl.domain}/api/application/users?page=${currentPage}&include=servers`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.pterodactyl.key}`
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            allUsers = [...allUsers, ...data.data];
            
            // Check if there's another page
            hasNextPage = data.meta.pagination.current_page < data.meta.pagination.total_pages;
            currentPage++;
            
            console.log(`[USERS] Fetched page ${data.meta.pagination.current_page}/${data.meta.pagination.total_pages}...`);
        }
        
        // Save to cache
        fs.writeFileSync(USER_CACHE_FILE, JSON.stringify(allUsers, null, 2));
        console.log(`[USERS] Cache updated with ${allUsers.length} users`);
        
        return allUsers;
    } catch (error) {
        console.error(chalk.red('[USERS] Error updating users cache:'), error);
        throw error;
    }
}

/**
 * Create a new user in Pterodactyl
 * @param {object} userData - User data
 * @returns {Promise<object>} - Created user object
 */
async function createUser(userData) {
    try {
        console.log('[USERS] Creating new user in Pterodactyl...');
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/users`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(userData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create user: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red('[USERS] Error creating user:'), error);
        throw error;
    }
}

/**
 * Update user in Pterodactyl
 * @param {string} userId - Pterodactyl user ID
 * @param {object} userData - User data to update
 * @returns {Promise<object>} - Updated user object
 */
async function updateUser(userId, userData) {
    try {
        console.log(`[USERS] Updating user ${userId} in Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/users/${userId}`,
            {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                },
                body: JSON.stringify(userData)
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update user: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Update cache
        await updateCache();
        
        return data.attributes;
    } catch (error) {
        console.error(chalk.red(`[USERS] Error updating user ${userId}:`), error);
        throw error;
    }
}

/**
 * Delete user from Pterodactyl
 * @param {string} userId - Pterodactyl user ID
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteUser(userId) {
    try {
        console.log(`[USERS] Deleting user ${userId} from Pterodactyl...`);
        
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/users/${userId}`,
            {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to delete user: ${response.status} ${response.statusText}`);
        }
        
        // Update cache
        await updateCache();
        
        return true;
    } catch (error) {
        console.error(chalk.red(`[USERS] Error deleting user ${userId}:`), error);
        throw error;
    }
}

// Add API routes for admin panel
router.get('/admin/users', async (req, res) => {
    try {
        const users = await getUsers(true);
        res.json({ users });
    } catch (error) {
        console.error(chalk.red('[USERS] Error fetching data for admin:'), error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Initialize by warming up cache
(async () => {
    try {
        console.log('[USERS] Initializing cache...');
        await getUsers(true);
        console.log('[USERS] Cache initialized successfully');
    } catch (err) {
        console.error(chalk.red('[USERS] Failed to initialize cache:'), err);
    }
})();

module.exports = {
    router,
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser
}; 