const settings = require("../settings.json");
const express = require('express');
const router = express.Router();
const indexjs = require("../index.js");
const fetch = require('node-fetch');
const fs = require('fs');
const ejs = require("ejs");
const adminjs = require("./admin.js");
const db = require("../db.js");

// Helper function to check API key
function check(req, res) {
    let settings = JSON.parse(fs.readFileSync("./settings.json").toString());
    if (settings.api.client.api.enabled !== true) return res.json({ status: "failed", message: "API is disabled." });

    if (!req.headers.authorization) return res.json({ status: "failed", message: "API key is required." });
    if (typeof req.headers.authorization !== "string") return res.json({ status: "failed", message: "API key must be a string." });
    if (req.headers.authorization !== settings.api.client.api.code) return res.json({ status: "failed", message: "Invalid API key." });

    return settings;
}

// API Routes
router.get("/", (req, res) => {
    let settings = JSON.parse(fs.readFileSync("./settings.json").toString());
    if (settings.api.client.api.enabled !== true) return res.json({ status: "success", message: "API is disabled." });
    res.json({ status: "success", message: "API is online." });
});

router.get("/userinfo", async (req, res) => {
    const checkResult = check(req, res);
    if (checkResult !== null) return checkResult;

    if (!req.query.id) return res.json({ status: "failed", message: "No user ID provided." });
    if (typeof req.query.id !== "string") return res.json({ status: "failed", message: "User ID must be a string." });
    
    let userinfo = await db.get("userinfo-" + req.query.id);
    if (!userinfo) return res.json({ status: "failed", message: "Invalid user ID." });
    
    res.json({ status: "success", userinfo });
});

router.get("/setcoins", async (req, res) => {
    const checkResult = check(req, res);
    if (checkResult !== null) return checkResult;

    if (!req.query.id) return res.json({ status: "failed", message: "No user ID provided." });
    if (typeof req.query.id !== "string") return res.json({ status: "failed", message: "User ID must be a string." });
    
    if (!req.query.coins) return res.json({ status: "failed", message: "No coins amount provided." });
    if (isNaN(req.query.coins)) return res.json({ status: "failed", message: "Coins amount must be a number." });
    
    let userinfo = await db.get("userinfo-" + req.query.id);
    if (!userinfo) return res.json({ status: "failed", message: "Invalid user ID." });
    
    await db.set("coins-" + req.query.id, parseInt(req.query.coins));
    res.json({ status: "success" });
});

router.get("/addcoins", async (req, res) => {
    const checkResult = check(req, res);
    if (checkResult !== null) return checkResult;

    if (!req.query.id) return res.json({ status: "failed", message: "No user ID provided." });
    if (typeof req.query.id !== "string") return res.json({ status: "failed", message: "User ID must be a string." });
    
    if (!req.query.coins) return res.json({ status: "failed", message: "No coins amount provided." });
    if (isNaN(req.query.coins)) return res.json({ status: "failed", message: "Coins amount must be a number." });
    
    let userinfo = await db.get("userinfo-" + req.query.id);
    if (!userinfo) return res.json({ status: "failed", message: "Invalid user ID." });
    
    let coins = await db.get("coins-" + req.query.id) || 0;
    coins = coins + parseInt(req.query.coins);
    await db.set("coins-" + req.query.id, coins);
    
    res.json({ status: "success" });
});

router.get("/setresources", async (req, res) => {
    const checkResult = check(req, res);
    if (checkResult !== null) return checkResult;

    if (!req.query.id) return res.json({ status: "failed", message: "No user ID provided." });
    if (typeof req.query.id !== "string") return res.json({ status: "failed", message: "User ID must be a string." });
    
    if (!req.query.package) return res.json({ status: "failed", message: "No package provided." });
    let settings = JSON.parse(fs.readFileSync("./settings.json").toString());
    if (!settings.api.client.packages.list[req.query.package]) return res.json({ status: "failed", message: "Invalid package." });
    
    let userinfo = await db.get("userinfo-" + req.query.id);
    if (!userinfo) return res.json({ status: "failed", message: "Invalid user ID." });
    
    await db.set("package-" + req.query.id, req.query.package);
    res.json({ status: "success" });
});

router.post("/setcoins", async (req, res) => {
  let settings = await check(req, res);
  if (!settings) return;

  if (typeof req.body !== "object") return res.send({status: "body must be an object"});
  if (Array.isArray(req.body)) return res.send({status: "body cannot be an array"});

  let id = req.body.id;
  let coins = req.body.coins;

  if (typeof id !== "string") return res.send({status: "id must be a string"});

  if (!(await db.get("users-" + id))) return res.send({status: "invalid id"});

  if (typeof coins !== "number") return res.send({status: "coins must be number"});

  if (coins < 0 || coins > 999999999999999) return res.send({status: "too small or big coins"});

  if (coins == 0) {
    await db.delete("coins-" + id)
  } else {
    await db.set("coins-" + id, coins);
  }

  res.send({status: "success"});
});

router.post("/addcoins", async (req, res) => {
  let settings = await check(req, res);
  if (!settings) return;

  if (typeof req.body !== "object") return res.send({status: "body must be an object"});
  if (Array.isArray(req.body)) return res.send({status: "body cannot be an array"});

  let id = req.body.id;
  let coins = req.body.coins;

  if (typeof id !== "string") return res.send({status: "id must be a string"});

  if (!(await db.get("users-" + id))) return res.send({status: "invalid id"});

  if (typeof coins !== "number") return res.send({status: "coins must be number"});

  let currentcoins = await db.get("coins-" + id) || 0;

  coins = coins + currentcoins;

  if (coins < 0 || coins > 999999999999999) return res.send({status: "too small or big coins"});

  if (coins == 0) {
    await db.delete("coins-" + id);
  } else {
    await db.set("coins-" + id, coins);
  }

  res.send({status: "success"});
});

router.post("/removeaccount", async (req, res) => {
  let settings = await check(req, res);
  if (!settings) return;

  if (typeof req.body !== "object") return res.send({status: "body must be an object"});
  if (Array.isArray(req.body)) return res.send({status: "body cannot be an array"});

  let id = req.body.id;

  if (typeof id !== "string") return res.send({status: "id must be a string"});

  if (!(await db.get("users-" + id))) return res.send({status: "invalid id"});

  let discordid = id;
  let pteroid = await db.get("users-" + discordid);

  // Remove IP.

  let selected_ip = await db.get("ip-" + discordid);

  if (selected_ip) {
  let allips = await db.get("ips") || [];
  allips = allips.filter(ip => ip !== selected_ip);

  if (allips.length == 0) {
      await db.delete("ips");
  } else {
      await db.set("ips", allips);
  }

  await db.delete("ip-" + discordid);
  }

  // Remove user.

  let userids = await db.get("users") || [];
  userids = userids.filter(user => user !== pteroid);

  if (userids.length == 0) {
  await db.delete("users");
  } else {
  await db.set("users", userids);
  }

  await db.delete("users-" + discordid);

  // Remove coins/resources.

  await db.delete("coins-" + discordid);
  await db.delete("extra-" + discordid);
  await db.delete("package-" + discordid);

  res.send({status: "success"});
});

router.post("/setplan", async (req, res) => {
  let settings = await check(req, res);
  if (!settings) return;

  if (typeof req.body !== "object") return res.send({status: "body must be an object"});
  if (Array.isArray(req.body)) return res.send({status: "body cannot be an array"});

  if (typeof req.body.id !== "string") return res.send({status: "missing id"});

  if (!(await db.get("users-" + req.body.id))) return res.send({status: "invalid id"});

  if (typeof req.body.package !== "string") {
    await db.delete("package-" + req.body.id);
    adminjs.suspend(req.body.id);
    return res.send({status: "success"});
  } else {
    let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());
    if (!newsettings.api.client.packages.list[req.body.package]) return res.send({status: "invalid package"});
    await db.set("package-" + req.body.id, req.body.package);
    adminjs.suspend(req.body.id);
    return res.send({status: "success"});
  }
});

router.post("/setresources", async (req, res) => {
  let settings = await check(req, res);
  if (!settings) return;

  if (typeof req.body !== "object") return res.send({status: "body must be an object"});
  if (Array.isArray(req.body)) return res.send({status: "body cannot be an array"});

  if (typeof req.body.id !== "string") return res.send({status: "missing id"});

  if (!(await db.get("users-" + req.body.id))) res.send({status: "invalid id"});

  if (typeof req.body.ram == "number" || typeof req.body.disk == "number" || typeof req.body.cpu == "number" || typeof req.body.servers == "number") {
    let ram = req.body.ram;
    let disk = req.body.disk;
    let cpu = req.body.cpu;
    let servers = req.body.servers;

    let currentextra = await db.get("extra-" + req.body.id);
    let extra;

    if (typeof currentextra == "object") {
      extra = currentextra;
    } else {
      extra = {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      }
    }

    if (typeof ram == "number") {
      if (ram < 0 || ram > 999999999999999) {
        return res.send({status: "ram size"});
      }
      extra.ram = ram;
    }
    
    if (typeof disk == "number") {
      if (disk < 0 || disk > 999999999999999) {
        return res.send({status: "disk size"});
      }
      extra.disk = disk;
    }
    
    if (typeof cpu == "number") {
      if (cpu < 0 || cpu > 999999999999999) {
        return res.send({status: "cpu size"});
      }
      extra.cpu = cpu;
    }

    if (typeof servers == "number") {
      if (servers < 0 || servers > 999999999999999) {
        return res.send({status: "server size"});
      }
      extra.servers = servers;
    }
    
    if (extra.ram == 0 && extra.disk == 0 && extra.cpu == 0 && extra.servers == 0) {
      await db.delete("extra-" + req.body.id);
    } else {
      await db.set("extra-" + req.body.id, extra);
    }

    adminjs.suspend(req.body.id);
    return res.send({status: "success"});
  } else {
    res.send({status: "missing variables"});
  }
});

router.post("/createcoupon", async (req, res) => {
  let settings = await check(req, res);
  if (!settings) return;

  if (typeof req.body !== "object") return res.send({status: "body must be an object"});
  if (Array.isArray(req.body)) return res.send({status: "body cannot be an array"});

  let code = typeof req.body.code == "string" ? req.body.code.slice(0, 200) : Math.random().toString(36).substring(2, 15);

  if (!code.match(/^[a-z0-9]+$/i)) return res.json({ status: "illegal characters" });

  let coins = typeof req.body.coins == "number" ? req.body.coins : 0;
  let ram = typeof req.body.ram == "number" ? req.body.ram : 0;
  let disk = typeof req.body.disk == "number" ? req.body.disk : 0;
  let cpu = typeof req.body.cpu == "number" ? req.body.cpu : 0;
  let servers = typeof req.body.servers == "number" ? req.body.servers : 0;

  if (coins < 0) return res.json({ status: "coins is less than 0" });
  if (ram < 0) return res.json({ status: "ram is less than 0" });
  if (disk < 0) return res.json({ status: "disk is less than 0" });
  if (cpu < 0) return res.json({ status: "cpu is less than 0" });
  if (servers < 0) return res.json({ status: "servers is less than 0" });

  if (!coins && !ram && !disk && !cpu && !servers) return res.json({ status: "cannot create empty coupon" });

  await db.set("coupon-" + code, {
    coins: coins,
    ram: ram,
    disk: disk,
    cpu: cpu,
    servers: servers
  });

  return res.json({ status: "success", code: code });
});

router.post("/revokecoupon", async (req, res) => {
  let settings = await check(req, res);
  if (!settings) return;

  if (typeof req.body !== "object") return res.send({status: "body must be an object"});
  if (Array.isArray(req.body)) return res.send({status: "body cannot be an array"});

  let code = req.body.code;

  if (!code) return res.json({ status: "missing code" });

  if (!code.match(/^[a-z0-9]+$/i)) return res.json({ status: "invalid code" });

  if (!(await db.get("coupon-" + code))) return res.json({ status: "invalid code" });

  await db.delete("coupon-" + code);

  res.json({ status: "success" })
});

// Export the router
module.exports = {
    router: router
};