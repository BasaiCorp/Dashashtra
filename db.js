// This file was specifically created to support past Dashactyl versions that used keyv.

const settings = require("./settings.json");

// Initialize SQLite database for auth
const authDb = require('better-sqlite3')('auth.db');

// Create users table with all Pterodactyl required fields
authDb.prepare(`CREATE TABLE IF NOT EXISTS "users" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "discord_id" VARCHAR(255) UNIQUE,
    "pterodactyl_id" INTEGER UNIQUE,
    "pterodactyl_username" VARCHAR(255),
    "pterodactyl_email" VARCHAR(255),
    "pterodactyl_first_name" VARCHAR(255),
    "pterodactyl_last_name" VARCHAR(255),
    "pterodactyl_language" VARCHAR(10) DEFAULT 'en',
    "pterodactyl_root_admin" BOOLEAN DEFAULT 0,
    "pterodactyl_2fa_enabled" BOOLEAN DEFAULT 0,
    "pterodactyl_2fa_secret" VARCHAR(255),
    "pterodactyl_2fa_method" VARCHAR(50),
    "pterodactyl_created_at" TIMESTAMP,
    "pterodactyl_updated_at" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).run();

// Create packages table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "packages" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "ram" INTEGER NOT NULL,
    "disk" INTEGER NOT NULL,
    "cpu" INTEGER NOT NULL,
    "servers" INTEGER NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`).run();

// Create servers table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "servers" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "pterodactyl_id" INTEGER UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "egg_id" INTEGER,
    "docker_image" VARCHAR(255),
    "startup" TEXT,
    "environment" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`).run();

// Create allocations table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "allocations" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "server_id" INTEGER NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "port" INTEGER NOT NULL,
    "is_default" BOOLEAN DEFAULT 0,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id)
)`).run();

// Create variables table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "variables" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "server_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "env_variable" VARCHAR(255) NOT NULL,
    "default_value" TEXT,
    "user_viewable" BOOLEAN DEFAULT 0,
    "user_editable" BOOLEAN DEFAULT 0,
    "rules" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id)
)`).run();

// Create backups table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "backups" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "server_id" INTEGER NOT NULL,
    "uuid" VARCHAR(36) UNIQUE NOT NULL,
    "name" VARCHAR(255),
    "size" INTEGER,
    "completed_at" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id)
)`).run();

// Create databases table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "databases" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "server_id" INTEGER NOT NULL,
    "pterodactyl_id" INTEGER UNIQUE,
    "database" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "remote" VARCHAR(255),
    "host" VARCHAR(255),
    "port" INTEGER,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id)
)`).run();

// Create user_resources table for storing purchased resources
authDb.prepare(`CREATE TABLE IF NOT EXISTS "user_resources" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "ram" INTEGER DEFAULT 0,
    "disk" INTEGER DEFAULT 0,
    "cpu" INTEGER DEFAULT 0,
    "servers" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`).run();

// Create afk_data table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "afk_data" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "last_afk" TIMESTAMP,
    "daily_afk_count" INTEGER DEFAULT 0,
    "last_afk_reset" DATE,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`).run();

// Create coins table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "coins" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "amount" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`).run();

// Create redeem_codes table
authDb.prepare(`CREATE TABLE IF NOT EXISTS "redeem_codes" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "code" VARCHAR(32) UNIQUE NOT NULL,
    "credits_amount" INTEGER NOT NULL,
    "max_uses" INTEGER NOT NULL,
    "uses_count" INTEGER DEFAULT 0,
    "expires_at" TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
)`).run();

// Create redeem_code_uses table to track who used which code
authDb.prepare(`CREATE TABLE IF NOT EXISTS "redeem_code_uses" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "code_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "redeemed_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (code_id) REFERENCES redeem_codes(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
)`).run();

// Create user methods
const userMethods = {
    async createUser(userData) {
        const stmt = authDb.prepare(`
            INSERT INTO users (
                email, password, username, first_name, last_name,
                pterodactyl_id, pterodactyl_username, pterodactyl_email,
                pterodactyl_first_name, pterodactyl_last_name,
                pterodactyl_created_at, pterodactyl_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        return stmt.run(
            userData.email,
            userData.password,
            userData.username,
            userData.first_name,
            userData.last_name,
            userData.pterodactyl_id,
            userData.pterodactyl_username,
            userData.pterodactyl_email,
            userData.pterodactyl_first_name,
            userData.pterodactyl_last_name,
            userData.pterodactyl_created_at,
            userData.pterodactyl_updated_at
        );
    },

    async getUserByEmail(email) {
        const stmt = authDb.prepare('SELECT * FROM users WHERE email = ?');
        return stmt.get(email);
    },

    async getUserById(id) {
        const stmt = authDb.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    },

    async getUserByDiscordId(discordId) {
        const stmt = authDb.prepare('SELECT * FROM users WHERE discord_id = ?');
        return stmt.get(discordId);
    },

    async getUserByPterodactylId(pterodactylId) {
        const stmt = authDb.prepare('SELECT * FROM users WHERE pterodactyl_id = ?');
        return stmt.get(pterodactylId);
    },

    async getUserCount() {
        const stmt = authDb.prepare('SELECT COUNT(*) as count FROM users');
        const result = stmt.get();
        return result ? result.count : 0;
    },

    async updateUser(userId, updateData) {
        const stmt = authDb.prepare(`
            UPDATE users SET
                email = COALESCE(?, email),
                password = COALESCE(?, password),
                username = COALESCE(?, username),
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                discord_id = COALESCE(?, discord_id),
                pterodactyl_id = COALESCE(?, pterodactyl_id),
                pterodactyl_username = COALESCE(?, pterodactyl_username),
                pterodactyl_email = COALESCE(?, pterodactyl_email),
                pterodactyl_first_name = COALESCE(?, pterodactyl_first_name),
                pterodactyl_last_name = COALESCE(?, pterodactyl_last_name),
                pterodactyl_language = COALESCE(?, pterodactyl_language),
                pterodactyl_root_admin = COALESCE(?, pterodactyl_root_admin),
                pterodactyl_2fa_enabled = COALESCE(?, pterodactyl_2fa_enabled),
                pterodactyl_2fa_secret = COALESCE(?, pterodactyl_2fa_secret),
                pterodactyl_2fa_method = COALESCE(?, pterodactyl_2fa_method),
                pterodactyl_updated_at = COALESCE(?, pterodactyl_updated_at),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        
        return stmt.run(
            updateData.email,
            updateData.password,
            updateData.username,
            updateData.first_name,
            updateData.last_name,
            updateData.discord_id,
            updateData.pterodactyl_id,
            updateData.pterodactyl_username,
            updateData.pterodactyl_email,
            updateData.pterodactyl_first_name,
            updateData.pterodactyl_last_name,
            updateData.pterodactyl_language,
            updateData.pterodactyl_root_admin,
            updateData.pterodactyl_2fa_enabled,
            updateData.pterodactyl_2fa_secret,
            updateData.pterodactyl_2fa_method,
            updateData.pterodactyl_updated_at,
            userId
        );
    },

    async deleteUser(userId) {
        const stmt = authDb.prepare('DELETE FROM users WHERE id = ?');
        return stmt.run(userId);
    }
};

// Create package methods
const packageMethods = {
    async createPackage(userId, packageData) {
        const stmt = authDb.prepare(`
            INSERT INTO packages (user_id, name, ram, disk, cpu, servers)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        return stmt.run(
            userId,
            packageData.name,
            packageData.ram,
            packageData.disk,
            packageData.cpu,
            packageData.servers
        );
    },

    async getUserPackage(userId) {
        const stmt = authDb.prepare('SELECT * FROM packages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
        return stmt.get(userId);
    }
};

// Create server methods
const serverMethods = {
    async createServer(userId, serverData) {
        const stmt = authDb.prepare(`
            INSERT INTO servers (
                user_id, pterodactyl_id, name, description, egg_id,
                docker_image, startup, environment
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        return stmt.run(
            userId,
            serverData.pterodactyl_id,
            serverData.name,
            serverData.description,
            serverData.egg_id,
            serverData.docker_image,
            serverData.startup,
            JSON.stringify(serverData.environment)
        );
    },

    async getUserServers(userId) {
        const stmt = authDb.prepare('SELECT * FROM servers WHERE user_id = ?');
        return stmt.all(userId);
    }
};

// Create resource methods
const resourceMethods = {
    async getUserResources(userId) {
        const stmt = authDb.prepare('SELECT * FROM user_resources WHERE user_id = ?');
        const result = stmt.get(userId);
        
        // If no resources exist yet, create a default entry with zeros
        if (!result) {
            await this.initUserResources(userId);
            return { user_id: userId, ram: 0, disk: 0, cpu: 0, servers: 0 };
        }
        
        return result;
    },
    
    async initUserResources(userId) {
        const stmt = authDb.prepare(`
            INSERT OR IGNORE INTO user_resources (user_id, ram, disk, cpu, servers)
            VALUES (?, 0, 0, 0, 0)
        `);
        return stmt.run(userId);
    },
    
    async updateUserResources(userId, resourceData) {
        // First ensure the user has a resource record
        await this.initUserResources(userId);
        
        // Then update with new values
        const stmt = authDb.prepare(`
            UPDATE user_resources SET
                ram = ram + ?,
                disk = disk + ?,
                cpu = cpu + ?,
                servers = servers + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        
        return stmt.run(
            resourceData.ram || 0,
            resourceData.disk || 0,
            resourceData.cpu || 0,
            resourceData.servers || 0,
            userId
        );
    },
    
    async setUserResources(userId, resourceData) {
        // First ensure the user has a resource record
        await this.initUserResources(userId);
        
        // Then set specific values
        const stmt = authDb.prepare(`
            UPDATE user_resources SET
                ram = ?,
                disk = ?,
                cpu = ?,
                servers = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        
        return stmt.run(
            resourceData.ram || 0,
            resourceData.disk || 0,
            resourceData.cpu || 0,
            resourceData.servers || 0,
            userId
        );
    }
};

// Add AFK methods
const afkMethods = {
    async getUserAfkData(userId) {
        const stmt = authDb.prepare('SELECT * FROM afk_data WHERE user_id = ?');
        return stmt.get(userId);
    },

    async createUserAfkData(userId) {
        const stmt = authDb.prepare(`
            INSERT INTO afk_data (user_id, last_afk_reset)
            VALUES (?, CURRENT_DATE)
        `);
        return stmt.run(userId);
    },

    async updateUserAfkData(userId, afkData) {
        const stmt = authDb.prepare(`
            UPDATE afk_data SET
                last_afk = COALESCE(?, last_afk),
                daily_afk_count = COALESCE(?, daily_afk_count),
                last_afk_reset = COALESCE(?, last_afk_reset),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        return stmt.run(
            afkData.last_afk,
            afkData.daily_afk_count,
            afkData.last_afk_reset,
            userId
        );
    },

    async resetDailyAfkCount(userId) {
        const stmt = authDb.prepare(`
            UPDATE afk_data SET
                daily_afk_count = 0,
                last_afk_reset = CURRENT_DATE,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        return stmt.run(userId);
    }
};

// Add coin methods
const coinMethods = {
    async getUserCoins(userId) {
        const stmt = authDb.prepare('SELECT amount FROM coins WHERE user_id = ?');
        const result = stmt.get(userId);
        return result ? result.amount : 0;
    },

    async createUserCoins(userId) {
        const stmt = authDb.prepare('INSERT INTO coins (user_id) VALUES (?)');
        return stmt.run(userId);
    },

    async updateUserCoins(userId, amount) {
        const stmt = authDb.prepare(`
            UPDATE coins SET
                amount = amount + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        return stmt.run(amount, userId);
    },

    async setUserCoins(userId, amount) {
        const stmt = authDb.prepare(`
            UPDATE coins SET
                amount = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `);
        return stmt.run(amount, userId);
    }
};

// Add redeem code methods
const redeemCodeMethods = {
    async createRedeemCode(codeData) {
        const stmt = authDb.prepare(`
            INSERT INTO redeem_codes (
                code, credits_amount, max_uses, expires_at, created_by
            ) VALUES (?, ?, ?, ?, ?)
        `);
        
        return stmt.run(
            codeData.code,
            codeData.credits_amount,
            codeData.max_uses,
            codeData.expires_at,
            codeData.created_by
        );
    },

    async getRedeemCode(code) {
        const stmt = authDb.prepare('SELECT * FROM redeem_codes WHERE code = ?');
        return stmt.get(code);
    },

    async getRedeemCodeById(id) {
        const stmt = authDb.prepare('SELECT * FROM redeem_codes WHERE id = ?');
        return stmt.get(id);
    },

    async getAllRedeemCodes() {
        const stmt = authDb.prepare('SELECT * FROM redeem_codes ORDER BY created_at DESC');
        return stmt.all();
    },

    async getActiveRedeemCodes() {
        const stmt = authDb.prepare(`
            SELECT * FROM redeem_codes 
            WHERE (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            AND uses_count < max_uses
            ORDER BY created_at DESC
        `);
        return stmt.all();
    },

    async incrementCodeUses(codeId) {
        const stmt = authDb.prepare(`
            UPDATE redeem_codes 
            SET uses_count = uses_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        return stmt.run(codeId);
    },

    async recordCodeUse(codeId, userId) {
        const stmt = authDb.prepare(`
            INSERT INTO redeem_code_uses (code_id, user_id)
            VALUES (?, ?)
        `);
        return stmt.run(codeId, userId);
    },

    async hasUserUsedCode(codeId, userId) {
        const stmt = authDb.prepare(`
            SELECT COUNT(*) as count 
            FROM redeem_code_uses 
            WHERE code_id = ? AND user_id = ?
        `);
        const result = stmt.get(codeId, userId);
        return result.count > 0;
    },

    async deleteRedeemCode(id) {
        const stmt = authDb.prepare('DELETE FROM redeem_codes WHERE id = ?');
        return stmt.run(id);
    }
};

// Export the methods
module.exports = {
    users: userMethods,
    packages: packageMethods,
    servers: serverMethods,
    resources: resourceMethods,
    afk: afkMethods,
    coins: coinMethods,
    redeemCodes: redeemCodeMethods,
    db: authDb
};