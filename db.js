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

    async getUserByPterodactylId(pterodactylId) {
        const stmt = authDb.prepare('SELECT * FROM users WHERE pterodactyl_id = ?');
        return stmt.get(pterodactylId);
    },

    async updateUser(userId, updateData) {
        const stmt = authDb.prepare(`
            UPDATE users SET
                email = COALESCE(?, email),
                password = COALESCE(?, password),
                username = COALESCE(?, username),
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
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

module.exports = {
    users: userMethods,
    packages: packageMethods,
    servers: serverMethods,
    db: authDb
};