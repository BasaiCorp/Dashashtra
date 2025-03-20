"use strict";

// Load packages.

const fs = require("fs");
const fetch = require('node-fetch');
const chalk = require("chalk");
const express = require("express");

// Load settings.

const settings = require("./settings.json");

const defaultthemesettings = {
  index: "index.ejs",
  notfound: "index.ejs",
  redirect: {},
  pages: {},
  mustbeloggedin: [],
  mustbeadmin: [],
  variables: {
    home: {
      name: "Flaxy Nodes",
      title: "Flaxy Nodes - Premium Game Server Hosting",
      description: "Premium game server hosting with unbeatable performance, reliability, and support. Start your gaming journey today."
    },
    store: {
      title: "Store - Flaxy Nodes"
    },
    error: {
      title: "Error - Flaxy Nodes"
    }
  }
};

module.exports.renderdataeval =
  `(async () => {
    let newsettings = JSON.parse(require("fs").readFileSync("./settings.json"));

    // Standard data retrieval for all users
    let renderdata = {
      req: req,
      settings: newsettings,
      userinfo: req.session.userinfo,
      theme: theme.name,
      extra: theme.settings.variables
    };

    // Add additional data if user is logged in
    if (req.session.userinfo) {
      try {
        // Get user's package information
        const userPackage = await db.packages.getUserPackage(req.session.userinfo.id);
        renderdata.packagename = userPackage ? userPackage.name : newsettings.api.client.packages.default;
        renderdata.packages = newsettings.api.client.packages.list[renderdata.packagename];

        // Get user's pterodactyl information
        renderdata.pterodactyl = req.session.pterodactyl;

        // Get extra resources (if enabled)
        renderdata.extraresources = {
          ram: 0,
          disk: 0,
          cpu: 0,
          servers: 0
        };

        // Get coins if enabled
        if (newsettings.api.client.coins.enabled) {
          renderdata.coins = 0; // Initialize with default value
        }

      } catch (error) {
        console.error('Error preparing render data:', error);
        // Set default values if there's an error
        renderdata.packagename = newsettings.api.client.packages.default;
        renderdata.packages = newsettings.api.client.packages.list[newsettings.api.client.packages.default];
        renderdata.extraresources = {
          ram: 0,
          disk: 0,
          cpu: 0,
          servers: 0
        };
      }
    }

    return renderdata;
  })();`;

// Load database

const db = require("./db.js");

module.exports.db = db;

// Initialize Discord bot if enabled
if (settings.api && settings.api.client && settings.api.client.bot && settings.api.client.bot.enabled) {
  console.log(chalk.blue("[BOT] Initializing Discord bot..."));
  try {
    // First deploy the commands
    console.log(chalk.blue("[BOT] Deploying slash commands..."));
    const deployCommands = require('./bot/deploy-commands.js');
    
    // Deploy commands then initialize the bot
    deployCommands()
      .then(() => {
        const bot = require('./bot/index.js');
        module.exports.bot = bot;
        console.log(chalk.green("[BOT] Discord bot initialized successfully!"));
      })
      .catch(error => {
        console.error(chalk.red("[BOT] Failed to deploy commands:"), error);
        // Continue with bot initialization even if command deployment fails
        const bot = require('./bot/index.js');
        module.exports.bot = bot;
        console.log(chalk.yellow("[BOT] Discord bot initialized without commands. You may need to run 'npm run deploy-commands' manually."));
      });
  } catch (error) {
    console.error(chalk.red("[BOT] Failed to initialize Discord bot:"), error);
  }
}

// Load websites.

const app = express();

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', './themes');

// Debug middleware for static files
app.use((req, res, next) => {
  console.log('Request URL:', req.url);
  next();
});

// Serve static files from assets directory
app.use('/assets', express.static('assets'));

// Serve static files from themes directory
app.use('/themes', express.static('themes'));

// Specific route for auth.css
app.get('/themes/custom/auth.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(__dirname + '/themes/custom/auth.css');
});

// Load express addons.

const expressWs = require('express-ws')(app);
const ejs = require("ejs");
const session = require("express-session");
const indexjs = require("./index.js");

// Sets up saving session data.
let sessionStore;

try {
    const sqlite = require("better-sqlite3");
    const SqliteStore = require("better-sqlite3-session-store")(session);
    const session_db = new sqlite("sessions.db");
    sessionStore = new SqliteStore({
        client: session_db,
        expired: {
            clear: true,
            intervalMs: 900000 // ms = 15min
        }
    });
} catch (error) {
    console.warn('SQLite session store initialization failed, using memory store:', error.message);
    // Fallback to memory store
    const MemoryStore = require('memorystore')(session);
    sessionStore = new MemoryStore({
        checkPeriod: 86400000 // Prune expired entries every 24h
    });
}

// Configure session middleware
app.use(session({
    store: sessionStore,
    secret: settings.website.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 86400000 // 24 hours
    }
}));

// Root route handler
app.get('/', async (req, res) => {
    console.log('[ROOT] Processing request for root path');
    
    // If user is logged in and has valid Pterodactyl session, redirect to dashboard
    if (req.session && req.session.userinfo && req.session.pterodactyl) {
        try {
            const user = await db.users.getUserById(req.session.userinfo.id);
            if (user && user.pterodactyl_id === req.session.pterodactyl.id) {
                console.log('[ROOT] User is logged in with valid session, redirecting to dashboard');
                return res.redirect("/dashboard");
            } else {
                // Invalid session, clear it
                req.session.destroy();
            }
        } catch (error) {
            console.error('[ROOT] Error validating user session:', error);
            req.session.destroy();
        }
    }
    
    // For non-logged-in users or invalid sessions, show the onboarding page
    let theme = indexjs.get(req);
    console.log(`[ROOT] Selected theme: ${theme.name}`);
    console.log(`[ROOT] Theme index page: ${theme.settings.index}`);
    
    try {
        console.log('[ROOT] Evaluating render data');
        const renderData = await eval(indexjs.renderdataeval);
        
        console.log('[ROOT] Rendering index page');
        ejs.renderFile(
            `./themes/${theme.name}/${theme.settings.index}`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[WEBSITE] Error rendering index page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the homepage. Please contact an administrator.");
                }
                console.log('[ROOT] Successfully rendered, sending response');
                res.send(str);
            }
        );
    } catch (error) {
        console.log(chalk.red(`[WEBSITE] Error processing index page:`), error);
        return res.send("An error occurred while preparing data for the homepage. Please try again.");
    }
});

// Handle servers route - MUST be defined before the catch-all route handler
app.get('/servers', async (req, res) => {
    console.log('[SERVERS] Processing request for servers page');
    
    // Check if user is logged in
    if (!req.session.userinfo || !req.session.pterodactyl) {
        console.log('[SERVERS] User not logged in, redirecting to login');
        return res.redirect("/login");
    }
    
    // Validate user session
    try {
        const user = await db.users.getUserById(req.session.userinfo.id);
        if (!user || user.pterodactyl_id !== req.session.pterodactyl.id) {
            console.log('[SERVERS] Invalid user session, redirecting to login');
            req.session.destroy();
            return res.redirect("/login");
        }
        
        // Get theme and render servers page
        let theme = indexjs.get(req);
        
        // Find the correct template for the servers page
        let serversTemplate = theme.settings.pages.servers || "servers.ejs";
        console.log(`[SERVERS] Using template: ${serversTemplate}`);
        
        // Get render data from indexjs
        const renderData = await eval(indexjs.renderdataeval);
        
        ejs.renderFile(
            `./themes/${theme.name}/${serversTemplate}`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[SERVERS] Error rendering servers page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the servers page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error('[SERVERS] Error processing servers page:', error);
        return res.send("An error occurred while preparing data for the servers page. Please try again.");
    }
});

// Import API routes
const adminRoutes = require('./api/admin.js');
const serverRoutes = require('./api/servers.js');
const { router: earnRouter } = require('./api/earn.js');

// Register API routes - moved after main routes
app.use('/api/servers', serverRoutes.router);
app.use('/api', earnRouter);

// Add middleware for parsing request bodies
app.use(express.json({
  inflate: true,
  limit: '500kb',
  reviver: null,
  strict: true,
  type: 'application/json',
  verify: undefined
}));

// Add middleware for parsing form data
app.use(express.urlencoded({ 
  extended: true,
  limit: '500kb'
}));

// Load the website.
module.exports.app = app;

const listener = app.listen(settings.website.port, function() {
  console.log(chalk.green("[WEBSITE] The dashboard has successfully loaded on port " + listener.address().port + "."));
});

let ipratelimit = {};
let cache = 0;

// More efficient cache reduction
const CACHE_REDUCTION_INTERVAL = 100; // 100ms
const CACHE_REDUCTION_AMOUNT = 0.1;

setInterval(() => {
  if (cache > 0) {
    cache = Math.max(0, cache - CACHE_REDUCTION_AMOUNT);
  }
}, CACHE_REDUCTION_INTERVAL);

// Clean up IP rate limits periodically
setInterval(() => {
  const now = Date.now();
  for (const ip in ipratelimit) {
    if (ipratelimit[ip].timestamp < now - (settings.api.client.ratelimits["per second"] * 1000)) {
      delete ipratelimit[ip];
    }
  }
}, 60000); // Clean up every minute

app.use(async (req, res, next) => {
  // Session check
  if (req.session.userinfo && req.session.userinfo.id) {
    const user = await db.users.getUserById(req.session.userinfo.id);
    if (!user) {
      let theme = indexjs.get(req);
      req.session.destroy(() => {
        return res.redirect(theme.settings.redirect.logout || "/");
      });
      return;
    }
  }

  let manager = {
    "/callback": 2,
    "/create": 1,
    "/delete": 1,
    "/modify": 1,
    "/updateinfo": 1,
    "/setplan": 2,
    "/admin": 1,
    "/regen": 1,
    "/renew": 1,
    "/api/userinfo": 1,
    "/userinfo": 2,
    "/remove_account": 1,
    "/create_coupon": 1,
    "/revoke_coupon": 1,
    "/getip": 1
  };

  if (manager[req._parsedUrl.pathname]) {
    if (cache > 0) {
      setTimeout(() => {
        let querystring = Object.entries(req.query)
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
        querystring = querystring ? `?${querystring}` : '';
        res.redirect((req._parsedUrl.pathname.slice(0, 1) == "/" ? req._parsedUrl.pathname : "/" + req._parsedUrl.pathname) + querystring);
      }, 1000);
      return;
    } else {
      let newsettings = JSON.parse(fs.readFileSync("./settings.json"));

      if (newsettings.api.client.ratelimits.enabled) {
        let ip = (newsettings.api.client.ratelimits["trust x-forwarded-for"] ? 
          (req.headers['x-forwarded-for'] || req.connection.remoteAddress) : 
          req.connection.remoteAddress)
          .replace(/::1/g, "::ffff:127.0.0.1")
          .replace(/^.*:/, '');

        if (!ipratelimit[ip]) {
          ipratelimit[ip] = {
            count: 0,
            timestamp: Date.now()
          };
        }

        if (ipratelimit[ip].count >= newsettings.api.client.ratelimits.requests) {
          res.status(429).send(`<html><head><title>Rate Limited</title></head><body>You have exceeded rate limits. Please try again later.</body></html>`);
          return;
        }

        ipratelimit[ip].count++;
        ipratelimit[ip].timestamp = Date.now();
      }

      cache += manager[req._parsedUrl.pathname];
    }
  }
  next();
});

// First load auth.js to ensure it's mounted before other routes
const authModule = require('./api/auth.js');
if (authModule.router) {
  app.use('/auth', authModule.router);
} else if (typeof authModule.load === 'function') {
  authModule.load(app, db);
}

// Handle create route - MUST be defined before the catch-all route handler
app.get('/create', async (req, res) => {
    console.log('[CREATE] Processing request for create page');
    
    // Check if user is logged in
    if (!req.session.userinfo || !req.session.pterodactyl) {
        console.log('[CREATE] User not logged in, redirecting to login');
        return res.redirect("/login");
    }
    
    // Validate user session
    try {
        const user = await db.users.getUserById(req.session.userinfo.id);
        if (!user || user.pterodactyl_id !== req.session.pterodactyl.id) {
            console.log('[CREATE] Invalid user session, redirecting to login');
            req.session.destroy();
            return res.redirect("/login");
        }
        
        // Check if server creation is enabled
        const settings = JSON.parse(fs.readFileSync("./settings.json").toString());
        if (settings.api.client.allow.server.create !== true) {
            return res.send("Server creation is currently disabled.");
        }
        
        // Get theme and render create page
        let theme = indexjs.get(req);
        
        // Find the correct template for the create page
        let createTemplate = theme.settings.pages.create || theme.settings.pages["servers/new"] || "create.ejs";
        console.log(`[CREATE] Using template: ${createTemplate}`);
        
        // Get render data from indexjs
        const renderData = await eval(indexjs.renderdataeval);
        
        // Get nests, eggs, and locations from cache
        const nests = JSON.parse(fs.readFileSync("./cache/nests_cache.json", "utf8"));
        const eggs = JSON.parse(fs.readFileSync("./cache/eggs_cache.json", "utf8"));
        const locations = JSON.parse(fs.readFileSync("./cache/locations_cache.json", "utf8"));
        
        // Add nests, eggs, and locations to render data
        renderData.nests = nests;
        renderData.eggs = eggs;
        renderData.locations = locations;
        
        ejs.renderFile(
            `./themes/${theme.name}/${createTemplate}`, 
            renderData,
            null,
            function (err, str) {
                if (err) {
                    console.log(chalk.red(`[CREATE] Error rendering create page:`));
                    console.log(err);
                    return res.send("An error occurred while loading the create page. Please contact an administrator.");
                }
                res.send(str);
            }
        );
    } catch (error) {
        console.error('[CREATE] Error processing create page:', error);
        return res.send("An error occurred while preparing data for the create page. Please try again.");
    }
});

// Then load other API files
const apifiles = fs.readdirSync('./api').filter(file => file.endsWith('.js'));
apifiles.forEach(file => {
    if (file !== 'auth.js' && file !== 'admin.js') { // Skip auth.js and admin.js since we already loaded them
        try {
            let apiModule = require(`./api/${file}`);
            if (apiModule && apiModule.router) {
                app.use('/', apiModule.router);
            } else if (typeof apiModule === 'function') {
                apiModule(app, db);
            } else if (apiModule && typeof apiModule.load === 'function') {
                apiModule.load(app, db);
            } else if (apiModule && typeof apiModule.getNests === 'function') {
                // This is a data fetcher module (like fetch_eggs.js)
                // We don't need to mount it as a router
                console.log(`[API] Loaded data fetcher module: ${file}`);
            } else {
                console.warn(`Warning: API file ${file} doesn't export a router, load function, or initialization function`);
            }
        } catch (error) {
            console.error(`Error loading API file ${file}:`, error);
        }
    }
});

// Register admin routes last to ensure proper route handling
app.use('/admin', adminRoutes.router);

// Explicit route handlers for login and register pages
app.get('/login', async (req, res) => {
    console.log('[LOGIN] Processing request for login page');
    
    // If user is already logged in, redirect to dashboard
    if (req.session.userinfo && req.session.pterodactyl) {
        try {
            const user = await db.users.getUserById(req.session.userinfo.id);
            if (user && user.pterodactyl_id === req.session.pterodactyl.id) {
                console.log('[LOGIN] User is already logged in, redirecting to dashboard');
                return res.redirect("/dashboard");
            }
        } catch (error) {
            console.error('[LOGIN] Error validating user session:', error);
            req.session.destroy();
        }
    }
    
    // Show login page for non-logged-in users
    // Ensure we're using the auth theme from settings for login/register
    let settings = JSON.parse(fs.readFileSync("./settings.json"));
    let auththeme = settings.auththeme;
    console.log(`[LOGIN] Using auth theme: ${auththeme}`);
    
    let theme = {
        name: auththeme,
        settings: fs.existsSync(`./themes/${auththeme}/pages.json`) ?
            JSON.parse(fs.readFileSync(`./themes/${auththeme}/pages.json`).toString()) :
            defaultthemesettings
    };
    
    try {
        const renderData = await eval(indexjs.renderdataeval);
        
        try {
            // Get login page from theme
            const loginPage = theme.settings.pages && theme.settings.pages.login ? 
                theme.settings.pages.login : 'login.ejs';
            
            console.log(`[LOGIN] Rendering login page: ./themes/${theme.name}/${loginPage}`);
            
            ejs.renderFile(
                `./themes/${theme.name}/${loginPage}`, 
                renderData,
                null,
                function (err, str) {
                    if (err) {
                        console.log(chalk.red(`[LOGIN] Error rendering login page:`));
                        console.log(err);
                        return res.send("An error occurred while loading the login page. Please contact an administrator.");
                    }
                    res.send(str);
                }
            );
        } catch (fileError) {
            console.log(chalk.red(`[LOGIN] Error with login page:`));
            console.log(fileError);
            return res.send("An error occurred while loading the login page. Please contact an administrator.");
        }
    } catch (error) {
        console.log(chalk.red(`[LOGIN] Error processing login page:`), error);
        return res.send("An error occurred while preparing data for the login page. Please try again.");
    }
});

app.get('/register', async (req, res) => {
    console.log('[REGISTER] Processing request for register page');
    
    // If user is already logged in, redirect to dashboard
    if (req.session.userinfo && req.session.pterodactyl) {
        try {
            const user = await db.users.getUserById(req.session.userinfo.id);
            if (user && user.pterodactyl_id === req.session.pterodactyl.id) {
                console.log('[REGISTER] User is already logged in, redirecting to dashboard');
                return res.redirect("/dashboard");
            }
        } catch (error) {
            console.error('[REGISTER] Error validating user session:', error);
            req.session.destroy();
        }
    }
    
    // Show register page for non-logged-in users
    // Ensure we're using the auth theme from settings for login/register
    let settings = JSON.parse(fs.readFileSync("./settings.json"));
    let auththeme = settings.auththeme;
    console.log(`[REGISTER] Using auth theme: ${auththeme}`);
    
    let theme = {
        name: auththeme,
        settings: fs.existsSync(`./themes/${auththeme}/pages.json`) ?
            JSON.parse(fs.readFileSync(`./themes/${auththeme}/pages.json`).toString()) :
            defaultthemesettings
    };
    
    try {
        const renderData = await eval(indexjs.renderdataeval);
        
        try {
            // Get register page from theme
            const registerPage = theme.settings.pages && theme.settings.pages.register ? 
                theme.settings.pages.register : 'register.ejs';
            
            console.log(`[REGISTER] Rendering register page: ./themes/${theme.name}/${registerPage}`);
            
            ejs.renderFile(
                `./themes/${theme.name}/${registerPage}`, 
                renderData,
                null,
                function (err, str) {
                    if (err) {
                        console.log(chalk.red(`[REGISTER] Error rendering register page:`));
                        console.log(err);
                        return res.send("An error occurred while loading the register page. Please contact an administrator.");
                    }
                    res.send(str);
                }
            );
        } catch (fileError) {
            console.log(chalk.red(`[REGISTER] Error with register page:`));
            console.log(fileError);
            return res.send("An error occurred while loading the register page. Please contact an administrator.");
        }
    } catch (error) {
        console.log(chalk.red(`[REGISTER] Error processing register page:`), error);
        return res.send("An error occurred while preparing data for the register page. Please try again.");
    }
});

app.all("*", async (req, res, next) => {
  // Skip session validation for login and register pages
  if (req._parsedUrl.pathname === '/login' || req._parsedUrl.pathname === '/register' || 
      req._parsedUrl.pathname.startsWith('/auth/')) {
    return next();
  }

  // Validate Pterodactyl session if it exists
  if (req.session && req.session.pterodactyl && req.session.userinfo) {
    try {
      const user = await db.users.getUserById(req.session.userinfo.id);
      if (!user || user.pterodactyl_id !== req.session.pterodactyl.id) {
        req.session.destroy();
        return res.redirect("/login?prompt=none");
      }
    } catch (error) {
      console.error("Error checking user session:", error);
      req.session.destroy();
      return res.redirect("/login?prompt=none");
    }
  }
  
  let theme = indexjs.get(req);
  let newsettings = JSON.parse(require("fs").readFileSync("./settings.json"));
  
  // Add this to ensure root redirects to the onboarding page
  if (req._parsedUrl.pathname === "/") {
    if (req.session && req.session.userinfo && req.session.pterodactyl) {
      return res.redirect("/dashboard");
    }
    // Default to showing the onboarding page (index.ejs) to non-logged-in users
  }
  
  // Allow regular users to access pages that require login
  if (theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname)) {
    if (!req.session || !req.session.userinfo || !req.session.pterodactyl) {
      return res.redirect("/login" + (req._parsedUrl.pathname.slice(0, 1) == "/" ? "?redirect=" + req._parsedUrl.pathname.slice(1) : ""));
    }
  }
  
  // Check for admin routes
  if (req._parsedUrl.pathname.startsWith('/admin') || theme.settings.mustbeadmin.includes(req._parsedUrl.pathname)) {
    // Admin routes are handled by the admin.js module, so pass through to it
    if (req._parsedUrl.pathname.startsWith('/admin')) {
      return next();
    }
    
    // For other routes that require admin access
    if (!req.session || !req.session.userinfo || !req.session.pterodactyl) {
      return res.redirect("/login");
    }
    
    ejs.renderFile(
      `./themes/${theme.name}/${theme.settings.notfound}`, 
      await eval(indexjs.renderdataeval),
      null,
    async function (err, str) {
      delete req.session.newaccount;
      delete req.session.password;
      
      try {
        let cacheaccount = await fetch(
          settings.pterodactyl.domain + "/api/application/users/" + req.session.pterodactyl.id + "?include=servers",
          {
            method: "get",
            headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
          }
        );
        
        if (cacheaccount.status === 404) {
          if (err) {
            console.log(chalk.red(`[WEBSITE] An error has occured on path ${req._parsedUrl.pathname}:`));
            console.log(err);
            return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
          };
          return res.send(str);
        }
        
        let cacheaccountinfo = await cacheaccount.json();
        req.session.pterodactyl = cacheaccountinfo.attributes;
        
        // Check if user is admin
        if (cacheaccountinfo.attributes.root_admin !== true) {
          console.log(`[ADMIN] User ${req.session.userinfo.id} tried to access admin page but is not an admin`);
          if (err) {
            console.log(chalk.red(`[WEBSITE] An error has occured on path ${req._parsedUrl.pathname}:`));
            console.log(err);
            return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
          };
          return res.send(str);
        }
        
        // Set admin status in session
        req.session.isAdmin = true;

        // Continue to next handler or render the page
        if (theme.settings.pages[req._parsedUrl.pathname.slice(1)]) {
          ejs.renderFile(
            `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)]}`, 
            await eval(indexjs.renderdataeval),
            null,
            function (err, str) {
              delete req.session.newaccount;
              delete req.session.password;
              if (err) {
                console.log(chalk.red(`[WEBSITE] An error has occured on path ${req._parsedUrl.pathname}:`));
                console.log(err);
                return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
              };
              res.send(str);
            }
          );
        } else {
          return res.status(404).send(str);
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        return res.send("An error occurred while checking admin status. Please try again later.");
      }
    });
    return;
  };
  
  // Render the requested page
  ejs.renderFile(
    `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)] ? theme.settings.pages[req._parsedUrl.pathname.slice(1)] : theme.settings.notfound}`, 
    await eval(indexjs.renderdataeval),
    null,
  function (err, str) {
    delete req.session.newaccount;
    delete req.session.password;
    if (err) {
      console.log(chalk.red(`[WEBSITE] An error has occured on path ${req._parsedUrl.pathname}:`));
      console.log(err);
      return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
    };
    
    // Only set 404 status if the page isn't found
    if (!theme.settings.pages[req._parsedUrl.pathname.slice(1)]) {
      res.status(404);
    }
    
    res.send(str);
  });
});

module.exports.get = function(req) {
  let settings = JSON.parse(fs.readFileSync("./settings.json"));
  let defaulttheme = settings.defaulttheme;
  let auththeme = settings.auththeme;
  
  // Use auth theme for login and register pages
  if (req._parsedUrl.pathname === '/login' || req._parsedUrl.pathname === '/register') {
    return {
      settings: (
        fs.existsSync(`./themes/${auththeme}/pages.json`) ?
          JSON.parse(fs.readFileSync(`./themes/${auththeme}/pages.json`).toString())
        : defaultthemesettings
      ),
      name: auththeme
    };
  }

  let tname = encodeURIComponent(getCookie(req, "theme"));
  let name = (
    tname ?
      fs.existsSync(`./themes/${tname}`) ?
        tname
      : defaulttheme
    : defaulttheme
  )
  return {
    settings: (
      fs.existsSync(`./themes/${name}/pages.json`) ?
        JSON.parse(fs.readFileSync(`./themes/${name}/pages.json`).toString())
      : defaultthemesettings
    ),
    name: name
  };
};

module.exports.islimited = async function() {
  return cache <= 0 ? true : false;
}

module.exports.ratelimits = async function(length) {
  cache = cache + length
}

// Get a cookie.
function getCookie(req, cname) {
  let cookies = req.headers.cookie;
  if (!cookies) return null;
  let name = cname + "=";
  let ca = cookies.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return decodeURIComponent(c.substring(name.length, c.length));
    }
  }
  return "";
}