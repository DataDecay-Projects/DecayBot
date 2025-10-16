//No-OP branch

const mineflayer = require('mineflayer');
const HashUtilsLib = require('./hashUtils.js');
const WebServer = require('./webServer.js');
const CommandParser = require('./commandParser.js');
const config = require('config');
const fs = require('fs');
const path = require('path');

class Bot {
    constructor() {
        this.bot = null;
        this.HashUtils = new HashUtilsLib();
        this.reconnectDelay = 10000;
        this.flagPath = path.join(__dirname, 'flag.json');
    }

    generateRandomizedName() {
        const baseName = config.get("connection.botName");
        return baseName.replace(/#/g, () => {
            const chars = 'abcdef0123456789';
            return chars.charAt(Math.floor(Math.random() * chars.length));
        });
    }

    start() {
        this.createBotInstance();
        this.setupAutoRestart();
    }

    createBotInstance() {
        const botName = this.generateRandomizedName();
        console.log(`Using bot name: ${botName}`);

        this.bot = mineflayer.createBot({
            host: config.get("connection.serverName"),
            port: config.get("connection.port"),
            username: botName,
            auth: 'offline',
            version: '',

            // BungeeCord forwarding data
            // If BungeeCord uses IP/UUID forwarding, enable it like so
            fakeHost: config.get("connection.bungeeHost") || config.get("connection.serverName"),
            skipValidation: true,
            hideErrors: false
        });

        this.client = this.bot._client;

        this.bot.on('spawn', () => {
            this.bot.chatAddPattern(/db:(\S+) ?(.+)?/, "command", "Command Sent");
            const io = new WebServer(config.get("webServer.port"), this.bot, this.HashUtils);
            io.start();
            this.bot.chat(`/register ${botName}`);

            this.commandParser = new CommandParser(this.bot, this.HashUtils);

            this.bot.on('command', async (command, argsraw) => {
                console.log(command + ", " + argsraw);
                if (command === "help") {
                    this.commandParser.showHelp(argsraw);
                } else {
                    await this.commandParser.handleCommand(command, argsraw ? argsraw.split(" ") : []);
                }
            });
        });

        this.bot.on('error', (err) => {
            console.log(err);
            this.updateFlag('restart', true);
            this.reconnect();
        });

        this.bot.on('end', (reason) => {
    console.log(`[Disconnect] ${reason}`);

    // If BungeeCord triggers a server switch, ignore reconnect
    const serverSwitchMessages = [
        "server closed",
        "connected to a fallback server",
        "sending you to",
        "kicked whilst connecting to"
    ];

    if (reason && serverSwitchMessages.some(msg => reason.toLowerCase().includes(msg))) {
        console.log("Detected BungeeCord server switch — skipping reconnect.");
        return; // do NOT reconnect
    }
    this.updateFlag('restart', true);
    this.reconnect();
});

this.bot.on('kick', (reason) => {
    console.log(`[Kick] ${reason}`);

    if (reason && reason.toLowerCase().includes("server closed")) {
        console.log("BungeeCord switch kick detected — ignoring reconnect.");
        return;
    }

    this.reconnect();
});

    }

    reconnect() {
        console.log(`Reconnecting...`);
        setTimeout(() => {
            this.start();
        }, this.reconnectDelay);
    }

    updateFlag(key, value) {
        fs.readFile(this.flagPath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading flag.json:', err);
                return;
            }

            let flags;
            try {
                flags = JSON.parse(data);
            } catch {
                return;
            }
            flags[key] = value;
            flags.last = new Date().toISOString();
            fs.writeFile(this.flagPath, JSON.stringify(flags, null, 2), (err) => {
                if (err) console.error('Error writing flag.json:', err);
            });
        });
    }

    setupAutoRestart() {
        const fiveHoursInMs = 5 * 60 * 60 * 1000;
        if (this.autoRestartInterval) return;

        this.autoRestartInterval = setInterval(() => {
            const currentTime = new Date();
            fs.readFile(this.flagPath, 'utf8', (err, data) => {
                if (err) return;

                let flags;
                try {
                    flags = JSON.parse(data);
                } catch {
                    return;
                }

                if (flags.last) {
                    const last = new Date(flags.last);
                    if (currentTime - last >= fiveHoursInMs) {
                        this.updateFlag('restart', true);
                    }
                }
            });
        }, 60 * 1000);
    }

    say(text, colour = "white") {
        if (this.bot) {
            this.bot.chat(text);
        }
    }
}

module.exports = Bot;
