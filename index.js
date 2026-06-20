const { makeWASocket, useMultiFileAuthState, makeInMemoryStore, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { handleMessage } = require('./main');
const config = require('./config.json');

// ========== কনফিগারেশন ==========
const SESSION_DIR = './session';
const PLUGINS_DIR = './plugins';
const PREFIX = config.prefix || '.';
const OWNER = config.ownerNumber;

// ========== সেশন ফোল্ডার চেক ==========
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// ========== প্লাগিন লোড ==========
let commands = new Map();
function loadPlugins() {
    commands.clear();
    if (!fs.existsSync(PLUGINS_DIR)) {
        fs.mkdirSync(PLUGINS_DIR, { recursive: true });
        console.log(chalk.yellow('📁 Plugins folder created!'));
        return;
    }
    
    const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
    for (const file of files) {
        try {
            const plugin = require(path.join(__dirname, PLUGINS_DIR, file));
            if (plugin.name && plugin.execute) {
                commands.set(plugin.name, plugin);
                console.log(chalk.green(`✅ Loaded plugin: ${plugin.name}`));
            }
        } catch (e) {
            console.log(chalk.red(`❌ Failed to load ${file}: ${e.message}`));
        }
    }
}

loadPlugins();
global.commands = commands;
global.prefix = PREFIX;
global.owner = OWNER;

// ========== স্টোর সেটআপ ==========
const store = makeInMemoryStore({
    logger: pino({ level: 'silent' })
});

// ========== বট সংযোগ ==========
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['WhatsApp Bot', 'Chrome', '10.0.0'],
        getMessage: async (key) => {
            return store.loadMessage(key.remoteJid, key.id);
        }
    });

    store.bind(sock.ev);

    // ========== QR কোড ==========
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log(chalk.yellow('📱 Scan this QR code with WhatsApp:'));
            qrcode.generate(qr, { small: true });
            console.log(chalk.cyan(`📱 Or use Pairing Code: ${config.pairingNumber || ''}`));
        }

        if (connection === 'connecting') {
            console.log(chalk.blue('🔄 Connecting...'));
        }

        if (connection === 'open') {
            console.log(chalk.green('✅ Bot is connected and ready!'));
            console.log(chalk.cyan(`👤 Owner: ${OWNER}`));
            console.log(chalk.cyan(`📋 Commands loaded: ${commands.size}`));
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red(`❌ Disconnected! Reconnecting: ${shouldReconnect}`));
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            } else {
                console.log(chalk.red('🔒 Logged out. Please restart bot.'));
            }
        }
    });

    // ========== ক্রেডেনশিয়াল সেভ ==========
    sock.ev.on('creds.update', saveCreds);

    // ========== মেসেজ হ্যান্ডলার ==========
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg || !msg.message) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption ||
                     msg.message.videoMessage?.caption ||
                     '';

        // ইগনোর নিজের মেসেজ
        if (msg.key.fromMe) return;

        // প্রিফিক্স চেক
        if (!body.startsWith(PREFIX)) return;

        const args = body.slice(PREFIX.length).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        // কমান্ড খুঁজুন
        let command = commands.get(commandName);
        if (!command) {
            // আলিয়াস চেক
            for (const [name, cmd] of commands) {
                if (cmd.aliases && cmd.aliases.includes(commandName)) {
                    command = cmd;
                    break;
                }
            }
        }

        if (!command) return;

        // ওনার চেক
        if (command.ownerOnly && sender !== OWNER + '@s.whatsapp.net') {
            await sock.sendMessage(from, { text: '❌ This command is owner only!' });
            return;
        }

        try {
            await command.execute(sock, msg, args, from, sender);
        } catch (e) {
            console.log(chalk.red(`❌ Error executing ${commandName}: ${e.message}`));
            await sock.sendMessage(from, { text: `❌ Error: ${e.message}` });
        }
    });

    return sock;
}

// ========== বট চালু করুন ==========
console.log(chalk.green('🚀 Starting WhatsApp Bot...'));
startBot().catch(e => console.log(chalk.red(`❌ Fatal error: ${e.message}`)));

// ========== প্রক্রিয়া হ্যান্ডলিং ==========
process.on('SIGINT', () => {
    console.log(chalk.yellow('👋 Bot stopped.'));
    process.exit(0);
});
