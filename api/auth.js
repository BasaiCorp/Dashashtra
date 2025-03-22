const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db.js');
const fetch = require('node-fetch');
const settings = require('../settings.json');

// Email/Password Registration
router.post('/register', async (req, res) => {
    try {
        const { email, password, username, firstName, lastName } = req.body;
        console.log(`[REGISTER] Attempting to register user: ${email}`);
        
        // Check for referral
        const referrerId = req.query.ref || req.body.ref || null;
        
        // Validate required fields
        if (!email || !password || !username || !firstName || !lastName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }

        // Check if user already exists in Pterodactyl
        const pterodactylCheckResponse = await fetch(
            `${settings.pterodactyl.domain}/api/application/users?filter[email]=${encodeURIComponent(email)}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );

        const pterodactylCheckData = await pterodactylCheckResponse.json();
        if (pterodactylCheckData.data && pterodactylCheckData.data.length > 0) {
            console.log(`[REGISTER] Email already registered in Pterodactyl: ${email}`);
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Create Pterodactyl account with user-provided credentials
        try {
            const pterodactylResponse = await fetch(
                `${settings.pterodactyl.domain}/api/application/users`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.pterodactyl.key}`
                    },
                    body: JSON.stringify({
                        username: username,
                        email: email,
                        first_name: firstName,
                        last_name: lastName,
                        password: password // Use the actual password provided by user
                    })
                }
            );

            if (!pterodactylResponse.ok) {
                const errorText = await pterodactylResponse.text();
                console.error(`[PTERODACTYL] Failed to create account: ${errorText}`);
                return res.status(500).json({ error: 'Failed to create account' });
            }

            const pterodactylData = await pterodactylResponse.json();
            const pterodactylId = pterodactylData.attributes.id;
            console.log(`[PTERODACTYL] Successfully created account with ID: ${pterodactylId}`);

            // Hash password for local database
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create user in local database with Pterodactyl data
            const userData = {
                email: email,
                password: hashedPassword,
                username: username,
                first_name: firstName,
                last_name: lastName,
                pterodactyl_id: String(pterodactylId),
                pterodactyl_username: pterodactylData.attributes.username,
                pterodactyl_email: pterodactylData.attributes.email,
                pterodactyl_first_name: pterodactylData.attributes.first_name,
                pterodactyl_last_name: pterodactylData.attributes.last_name,
                pterodactyl_created_at: pterodactylData.attributes.created_at,
                pterodactyl_updated_at: pterodactylData.attributes.updated_at
            };

            const user = await db.users.createUser(userData);
            console.log(`[DATABASE] Created local user with ID: ${user.lastInsertRowid}`);
            
            // Process referral reward if referrer exists
            if (referrerId) {
                try {
                    // Temporarily using require here to access user_coins module
                    const userCoins = require('./user_coins.js');
                    
                    // Award referral credits to the referrer
                    const referralCredits = 200; // 200 credits per referral
                    const newBalance = await userCoins.addCoins(referrerId, referralCredits);
                    
                    // Update referrer's session if they are online
                    // Get all active sessions
                    const sessionStore = req.sessionStore;
                    if (sessionStore && typeof sessionStore.all === 'function') {
                        sessionStore.all((err, sessions) => {
                            if (err) {
                                console.error('[REFERRAL] Error getting sessions:', err);
                                return;
                            }
                            
                            // Find referrer's session
                            Object.keys(sessions).forEach(sid => {
                                const session = sessions[sid];
                                if (session.userinfo && session.userinfo.id === parseInt(referrerId)) {
                                    // Update referrer's session with new balance and increment referral count
                                    session.userinfo.coins = newBalance;
                                    session.referrals = (session.referrals || 0) + 1;
                                    sessionStore.set(sid, session, (err) => {
                                        if (err) console.error('[REFERRAL] Error updating session:', err);
                                    });
                                }
                            });
                        });
                    }
                    
                    console.log(`[REFERRAL] User ${referrerId} earned ${referralCredits} credits for referring ${email}`);
                } catch (error) {
                    console.error('[REFERRAL] Error processing referral reward:', error);
                    // Non-critical error, continue with registration
                }
            }
            
            // Set default package
            await db.packages.createPackage(user.lastInsertRowid, {
                name: settings.api.client.packages.default,
                ...settings.api.client.packages.list[settings.api.client.packages.default]
            });
            console.log(`[DATABASE] Set default package for user ${user.lastInsertRowid}`);
            
            // Create new session
            req.session.userinfo = {
                id: user.lastInsertRowid,
                email: email,
                username: username,
                first_name: firstName,
                last_name: lastName,
                type: 'email'
            };
            req.session.pterodactyl = pterodactylData.attributes;

            console.log(`[REGISTER] Successfully completed registration for user: ${email}`);
            res.json({ success: true });
        } catch (error) {
            console.error('[PTERODACTYL] Error creating account:', error);
            res.status(500).json({ error: 'Failed to create account' });
        }
    } catch (error) {
        console.error('[REGISTER] Internal server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Email/Password Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[LOGIN] Attempting login for user: ${email}`);

        // First check if user exists in Pterodactyl
        try {
            // First verify credentials with Pterodactyl
            const pterodactylAuthResponse = await fetch(
                `${settings.pterodactyl.domain}/api/application/users?filter[email]=${encodeURIComponent(email)}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.pterodactyl.key}`
                    }
                }
            );

            if (!pterodactylAuthResponse.ok) {
                console.error(`[PTERODACTYL] Failed to find user: ${await pterodactylAuthResponse.text()}`);
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }

            const pterodactylUserData = await pterodactylAuthResponse.json();
            if (!pterodactylUserData.data || pterodactylUserData.data.length === 0) {
                console.log(`[LOGIN] User not found in Pterodactyl: ${email}`);
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }

            const pterodactylUser = pterodactylUserData.data[0].attributes;

            // Check if user exists in local database
            let user = await db.users.getUserByEmail(email);
            
            if (!user) {
                console.log(`[LOGIN] User exists in Pterodactyl but not in local database. Creating local account.`);
                // Create local user account with the same password
                const hashedPassword = await bcrypt.hash(password, 10);
                const userData = {
                    email: pterodactylUser.email,
                    password: hashedPassword,
                    username: pterodactylUser.username,
                    first_name: pterodactylUser.first_name,
                    last_name: pterodactylUser.last_name,
                    pterodactyl_id: String(pterodactylUser.id),
                    pterodactyl_username: pterodactylUser.username,
                    pterodactyl_email: pterodactylUser.email,
                    pterodactyl_first_name: pterodactylUser.first_name,
                    pterodactyl_last_name: pterodactylUser.last_name,
                    pterodactyl_created_at: pterodactylUser.created_at,
                    pterodactyl_updated_at: pterodactylUser.updated_at
                };

                const newUser = await db.users.createUser(userData);
                user = await db.users.getUserById(newUser.lastInsertRowid);

                // Set default package for new user
                await db.packages.createPackage(user.id, {
                    name: settings.api.client.packages.default,
                    ...settings.api.client.packages.list[settings.api.client.packages.default]
                });
            } else {
                // Verify password for existing user
                const validPassword = await bcrypt.compare(password, user.password);
                if (!validPassword) {
                    console.log(`[LOGIN] Invalid password for user: ${email}`);
                    return res.status(401).json({ success: false, error: 'Invalid credentials' });
                }
            }

            // Get detailed Pterodactyl user data including servers
            const pterodactylDetailResponse = await fetch(
                `${settings.pterodactyl.domain}/api/application/users/${pterodactylUser.id}?include=servers`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.pterodactyl.key}`
                    }
                }
            );

            if (!pterodactylDetailResponse.ok) {
                console.error(`[PTERODACTYL] Failed to get user details: ${await pterodactylDetailResponse.text()}`);
                return res.status(500).json({ success: false, error: 'Failed to get user details' });
            }

            const pterodactylDetailData = await pterodactylDetailResponse.json();

            // Store user data in session
            req.session.userinfo = {
                id: user.id,
                email: user.email,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                type: 'email'
            };

            // IMPORTANT: Store pterodactyl ID as string to ensure consistent comparison
            if (pterodactylDetailData.attributes && pterodactylDetailData.attributes.id) {
                // Store ptero ID as string - this fixes comparison issues in session validation
                pterodactylDetailData.attributes.id = String(pterodactylDetailData.attributes.id);
            }
            req.session.pterodactyl = pterodactylDetailData.attributes;

            // Get user's package
            const userPackage = await db.packages.getUserPackage(user.id);
            req.session.package = userPackage;

            // Set admin status in session
            req.session.isAdmin = pterodactylDetailData.attributes.root_admin === true;

            console.log(`[LOGIN] Successfully completed login for user: ${email} (Admin: ${req.session.isAdmin}, Ptero ID: ${pterodactylDetailData.attributes.id})`);

            // Save session before redirecting
            req.session.save(err => {
                if (err) {
                    console.error('[LOGIN] Error saving session:', err);
                    return res.status(500).json({ success: false, error: 'Failed to save session' });
                }
                
                res.json({ 
                    success: true, 
                    redirect: '/dashboard',
                    isAdmin: req.session.isAdmin
                });
            });

        } catch (error) {
            console.error('[PTERODACTYL] Login verification error:', error);
            res.status(500).json({ success: false, error: 'Failed to verify credentials' });
        }
    } catch (error) {
        console.error('[LOGIN] Internal server error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Discord OAuth
router.get('/discord', (req, res) => {
    if (!settings.api.client.oauth2.id || !settings.api.client.oauth2.secret) {
        return res.redirect('/login?error=oauth_not_configured');
    }
    
    const redirectUri = `${settings.api.client.oauth2.link}${settings.api.client.oauth2.callbackpath}`;
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${settings.api.client.oauth2.id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email%20guilds`;
    
    res.redirect(authUrl);
});

// Discord OAuth Callback
router.get('/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect('/login?error=no_code');
    }

    try {
        const redirectUri = `${settings.api.client.oauth2.link}${settings.api.client.oauth2.callbackpath}`;
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: settings.api.client.oauth2.id,
                client_secret: settings.api.client.oauth2.secret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                scope: 'identify email guilds'
            })
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            return res.redirect('/login?error=invalid_token');
        }

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`
            }
        });

        const userData = await userResponse.json();
        
        // Get user's guilds
        const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`
            }
        });

        const guildsData = await guildsResponse.json();

        // Check if user exists in local database
        let user = await db.users.getUserByDiscordId(userData.id);
        let isNewAccount = false;

        if (!user) {
            isNewAccount = true;
            
            // Generate a secure random password for Pterodactyl
            const password = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create Pterodactyl account
            try {
                const pterodactylResponse = await fetch(
                    `${settings.pterodactyl.domain}/api/application/users`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${settings.pterodactyl.key}`
                        },
                        body: JSON.stringify({
                            username: userData.username,
                            email: userData.email || `${userData.id}@discord.user`,
                            first_name: userData.username,
                            last_name: '#' + userData.discriminator,
                            password: password
                        })
                    }
                );

                if (!pterodactylResponse.ok) {
                    console.error('Failed to create Pterodactyl account:', await pterodactylResponse.text());
                    return res.redirect('/login?error=pterodactyl_account_creation_failed');
                }

                const pterodactylData = await pterodactylResponse.json();
                
                // Create user in local database
                const userData = {
                    email: userData.email || `${userData.id}@discord.user`,
                    password: hashedPassword,
                    username: userData.username,
                    first_name: userData.username,
                    last_name: '#' + userData.discriminator,
                    discord_id: userData.id,
                    pterodactyl_id: String(pterodactylData.attributes.id),
                    pterodactyl_username: pterodactylData.attributes.username,
                    pterodactyl_email: pterodactylData.attributes.email,
                    pterodactyl_first_name: pterodactylData.attributes.first_name,
                    pterodactyl_last_name: pterodactylData.attributes.last_name,
                    pterodactyl_created_at: pterodactylData.attributes.created_at,
                    pterodactyl_updated_at: pterodactylData.attributes.updated_at
                };

                user = await db.users.createUser(userData);
                
                // Set default package
                await db.packages.createPackage(user.lastInsertRowid, {
                    name: settings.api.client.packages.default,
                    ...settings.api.client.packages.list[settings.api.client.packages.default]
                });
            } catch (error) {
                console.error('Error creating Pterodactyl account:', error);
                return res.redirect('/login?error=pterodactyl_account_creation_failed');
            }
        }

        // Get Pterodactyl user data
        try {
            const pterodactylUserResponse = await fetch(
                `${settings.pterodactyl.domain}/api/application/users/${user.pterodactyl_id}?include=servers`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.pterodactyl.key}`
                    }
                }
            );

            if (!pterodactylUserResponse.ok) {
                console.error('Failed to fetch Pterodactyl user data:', await pterodactylUserResponse.text());
                return res.redirect('/login?error=pterodactyl_data_fetch_failed');
            }

            const pterodactylUserData = await pterodactylUserResponse.json();
            
            // Store user data in session
            req.session.userinfo = {
                id: user.id,
                email: user.email,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                discord_id: user.discord_id,
                avatar: userData.avatar,
                discriminator: userData.discriminator,
                guilds: guildsData,
                type: 'discord'
            };

            // IMPORTANT: Store pterodactyl ID as string to ensure consistent comparison
            if (pterodactylUserData.attributes && pterodactylUserData.attributes.id) {
                // Store ptero ID as string - this fixes comparison issues in session validation
                pterodactylUserData.attributes.id = String(pterodactylUserData.attributes.id);
            }
            req.session.pterodactyl = pterodactylUserData.attributes;

            // Set new account flag if this is a new account
            if (isNewAccount) {
                req.session.newaccount = true;
            }

            // Get user's package
            const userPackage = await db.packages.getUserPackage(user.id);
            req.session.package = userPackage;

            // Set admin status in session
            req.session.isAdmin = pterodactylUserData.attributes.root_admin === true;

            console.log(`[DISCORD AUTH] Successfully completed login for user: ${user.email} (Admin: ${req.session.isAdmin}, Ptero ID: ${pterodactylUserData.attributes.id})`);

            // Save session before redirecting
            req.session.save(err => {
                if (err) {
                    console.error('[LOGIN] Error saving session:', err);
                    return res.redirect('/login?error=session_save_failed');
                }
                
                // Redirect to the dashboard
                return res.redirect('/dashboard');
            });
        } catch (error) {
            console.error('Error fetching Pterodactyl user data:', error);
            return res.redirect('/login?error=pterodactyl_data_fetch_failed');
        }
    } catch (error) {
        console.error('OAuth error:', error);
        res.redirect('/login?error=oauth_error');
    }
});

// Logout
router.get('/logout', (req, res) => {
    // Clear all session data
    req.session.destroy((err) => {
        if (err) {
            console.error('[LOGOUT] Error destroying session:', err);
        }
        res.redirect('/');
    });
});

// Export both the router and the load function
module.exports = {
    router: router,
    load: function(app) {
        app.use('/auth', router);
        return router;
    }
}; 