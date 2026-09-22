const { getDb } = require('../database/db');
const { DEFAULT_RECOVERY_DAYS } = require('../config/constants');

function ensureGuild(guildId) {
  const db = getDb();
  const existing = db.prepare('SELECT guild_id FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!existing) {
    db.prepare(
      `INSERT INTO guild_settings (guild_id, recovery_days) VALUES (?, ?)`
    ).run(guildId, DEFAULT_RECOVERY_DAYS);
  }
  return getSettings(guildId);
}

function getSettings(guildId) {
  const db = getDb();
  ensureGuild(guildId);
  return db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
}

function updateSettings(guildId, updates) {
  const db = getDb();
  ensureGuild(guildId);
  const keys = Object.keys(updates);
  if (keys.length === 0) return getSettings(guildId);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => updates[k]);
  db.prepare(
    `UPDATE guild_settings SET ${sets}, updated_at = datetime('now') WHERE guild_id = ?`
  ).run(...values, guildId);
  return getSettings(guildId);
}

function nextTicketNumber(guildId) {
  const db = getDb();
  ensureGuild(guildId);
  db.prepare(
    `UPDATE guild_settings SET ticket_counter = ticket_counter + 1, updated_at = datetime('now') WHERE guild_id = ?`
  ).run(guildId);
  const row = db.prepare(
    `SELECT ticket_counter FROM guild_settings WHERE guild_id = ?`
  ).get(guildId);
  return row.ticket_counter;
}

function resetSettings(guildId) {
  const db = getDb();
  db.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId);
  return ensureGuild(guildId);
}

module.exports = {
  ensureGuild,
  getSettings,
  updateSettings,
  nextTicketNumber,
  resetSettings
};
