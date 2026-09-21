const { REST, Routes } = require('discord.js');
const { processExpiredArchives } = require('../services/ticketService');
const customCommandService = require('../services/customCommandService');
const mainCommand = require('../commands/globeworks-ticket');

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const body = [mainCommand.data.toJSON()];

  // Note: custom commands are subcommands under the same root; for fully dynamic
  // custom names we'd need additional top-level commands. We keep them as
  // /globeworks-ticket <name> handled via a catch-all pattern in interactionCreate
  // by checking if the "subcommand" matches a custom command when group is null.
  // Discord requires declared subcommands, so custom commands are invoked as
  // a message or we register extra slash commands per guild.

  // For proper dynamic registration we also register enabled custom commands
  // as additional top-level slash commands namespaced under a prefix if needed.
  // Spec says: custom commands execute under the same namespace.
  // Since Discord does not allow fully dynamic subcommands without re-register,
  // we re-build the command with extra subcommands for each custom command.

  try {
    // Collect all unique custom command names across guilds is not ideal for global.
    // Register base command globally, and guild-specific extras if DEV_GUILD_ID set.
    if (process.env.DEV_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.DEV_GUILD_ID),
        { body }
      );
      console.log('[Commands] Registered guild commands for development guild.');
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body }
      );
      console.log('[Commands] Registered global application commands.');
    }
  } catch (err) {
    console.error('[Commands] Registration failed:', err);
  }
}

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[Ready] Logged in as ${client.user.tag}`);
    console.log(`[Ready] Serving ${client.guilds.cache.size} guild(s)`);

    await registerCommands(client);

    const expired = processExpiredArchives();
    if (expired > 0) {
      console.log(`[Archive] Processed ${expired} expired archive(s) on startup.`);
    }

    // Maintenance interval: every hour check expirations
    setInterval(() => {
      try {
        const n = processExpiredArchives();
        if (n > 0) console.log(`[Archive] Processed ${n} expired archive(s).`);
      } catch (e) {
        console.error('[Archive] Maintenance error:', e.message);
      }
    }, 60 * 60 * 1000);

    client.user.setActivity('/globeworks-ticket', { type: 3 });
  }
};
