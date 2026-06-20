module.exports = {
    name: 'ping',
    aliases: ['পিং'],
    ownerOnly: false,
    async execute(sock, msg, args, from, sender) {
        const start = Date.now();
        await sock.sendMessage(from, { text: '🏓 Pinging...' });
        const end = Date.now();
        await sock.sendMessage(from, { text: `🏓 Pong! ${end - start}ms` });
    }
};
