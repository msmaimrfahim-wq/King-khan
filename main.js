const config = require('./config.json');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// ========== পেয়ারিং সিস্টেম ==========
const pairRequests = new Map();

async function handlePairing(sock, msg, args, from, sender) {
    const target = args[0];
    if (!target) {
        await sock.sendMessage(from, { 
            text: `⚠️ Please provide a number!\nExample: ${config.prefix}pair 8801234567890` 
        });
        return;
    }

    // নম্বর ক্লিন করা
    let number = target.replace(/[^0-9]/g, '');
    if (!number.startsWith('880')) number = '880' + number;
    if (number.length < 11) {
        await sock.sendMessage(from, { 
            text: '❌ Invalid number! Use 880XXXXXXXXXX format.' 
        });
        return;
    }

    // পেয়ারিং কোড জেনারেট
    const code = Math.floor(100000 + Math.random() * 900000);
    pairRequests.set(number, {
        code: code,
        timestamp: Date.now()
    });

    await sock.sendMessage(from, {
        text: `✅ Pairing code generated!\n📱 Number: ${number}\n🔑 Code: *${code}*\n\nSend this code from that number: ${config.prefix}verify ${code}`
    });

    // 5 মিনিট পর রিকোয়েস্ট ডিলিট
    setTimeout(() => {
        if (pairRequests.has(number)) {
            pairRequests.delete(number);
        }
    }, 300000);
}

async function handleVerify(sock, msg, args, from, sender) {
    const code = args[0];
    if (!code) {
        await sock.sendMessage(from, {
            text: `⚠️ Please provide the code!\nExample: ${config.prefix}verify 123456`
        });
        return;
    }

    const senderNumber = sender.split('@')[0];
    const request = pairRequests.get(senderNumber);

    if (!request) {
        await sock.sendMessage(from, {
            text: '❌ No pending pair request for your number!'
        });
        return;
    }

    if (request.code !== parseInt(code)) {
        await sock.sendMessage(from, {
            text: '❌ Invalid code! Please try again.'
        });
        return;
    }

    // পেয়ার সফল
    pairRequests.delete(senderNumber);
    
    // পেয়ারড লিস্টে সেভ
    let paired = [];
    if (fs.existsSync('./paired.json')) {
        paired = JSON.parse(fs.readFileSync('./paired.json'));
    }
    if (!paired.includes(senderNumber)) {
        paired.push(senderNumber);
        fs.writeFileSync('./paired.json', JSON.stringify(paired, null, 2));
    }

    await sock.sendMessage(from, {
        text: `✅ Successfully paired!\n🎉 You can now use all bot commands.\n📋 Type ${config.prefix}help to see available commands.`
    });

    // ওনারকে নোটিফিকেশন
    await sock.sendMessage(config.ownerNumber + '@s.whatsapp.net', {
        text: `🔔 New user paired!\n📱 ${senderNumber}`
    });
}

async function isPaired(sender) {
    if (!fs.existsSync('./paired.json')) return false;
    const paired = JSON.parse(fs.readFileSync('./paired.json'));
    return paired.includes(sender.split('@')[0]);
}

// ========== এক্সপোর্ট ==========
module.exports = {
    handlePairing,
    handleVerify,
    isPaired,
    pairRequests
};
