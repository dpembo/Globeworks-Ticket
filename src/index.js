require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { migrate } = require('./database/schema');
const { closeDb } = require('./database/db');

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.commands = new Collection();

// Load events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Database
console.log('[Startup] Initializing database...');
migrate();
console.log('[Startup] Database ready.');

process.on('SIGINT', () => {
  console.log('[Shutdown] Closing...');
  closeDb();
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[Login Failed]', err.message);
  process.exit(1);
});
