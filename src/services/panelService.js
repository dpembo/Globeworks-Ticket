const { getDb } = require('../database/db');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { panelEmbed } = require('../utils/embeds');
const { BUTTON_STYLES } = require('../config/constants');

function createPanel(guildId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO panels (
      guild_id, name, description, embed_title, embed_description, embed_footer,
      embed_color, button_label, button_emoji, button_style, category_id,
      staff_role_id, naming_format, claim_required, max_open_per_user, use_thread
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    data.name,
    data.description || null,
    data.embed_title || data.name,
    data.embed_description || data.description || null,
    data.embed_footer || null,
    data.embed_color || '#5865F2',
    data.button_label || 'Open Ticket',
    data.button_emoji || null,
    data.button_style || 'Primary',
    data.category_id || null,
    data.staff_role_id || null,
    data.naming_format || 'ticket-{number}',
    data.claim_required ? 1 : 0,
    data.max_open_per_user ?? 1,
    data.use_thread ? 1 : 0
  );
  return getPanelById(result.lastInsertRowid);
}

function getPanelById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM panels WHERE id = ?').get(id);
}

function getPanelByName(guildId, name) {
  const db = getDb();
  return db.prepare('SELECT * FROM panels WHERE guild_id = ? AND name = ?').get(guildId, name);
}

function listPanels(guildId) {
  const db = getDb();
  return db.prepare('SELECT * FROM panels WHERE guild_id = ? ORDER BY name ASC').all(guildId);
}

function updatePanel(id, data) {
  const db = getDb();
  const allowed = [
    'name', 'description', 'embed_title', 'embed_description', 'embed_footer',
    'embed_color', 'button_label', 'button_emoji', 'button_style', 'category_id',
    'staff_role_id', 'naming_format', 'claim_required', 'max_open_per_user',
    'use_thread', 'enabled', 'message_id', 'channel_id'
  ];
  const updates = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updates[k] = data[k];
  }
  if (Object.keys(updates).length === 0) return getPanelById(id);
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(
    `UPDATE panels SET ${sets}, updated_at = datetime('now') WHERE id = ?`
  ).run(...Object.values(updates), id);
  return getPanelById(id);
}

function deletePanel(id) {
  const db = getDb();
  db.prepare('DELETE FROM panel_questions WHERE panel_id = ?').run(id);
  db.prepare('DELETE FROM panels WHERE id = ?').run(id);
}

function addQuestion(panelId, guildId, data) {
  const db = getDb();
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM panel_questions WHERE panel_id = ?'
  ).get(panelId).m;
  const result = db.prepare(`
    INSERT INTO panel_questions (panel_id, guild_id, label, placeholder, required, style, min_length, max_length, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    panelId,
    guildId,
    data.label,
    data.placeholder || null,
    data.required !== false ? 1 : 0,
    data.style || 'Short',
    data.min_length ?? 0,
    data.max_length ?? 1000,
    maxOrder + 1
  );
  return db.prepare('SELECT * FROM panel_questions WHERE id = ?').get(result.lastInsertRowid);
}

function updateQuestion(id, data) {
  const db = getDb();
  const allowed = ['label', 'placeholder', 'required', 'style', 'min_length', 'max_length', 'sort_order'];
  const updates = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updates[k] = data[k];
  }
  if (Object.keys(updates).length === 0) return;
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE panel_questions SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
}

function deleteQuestion(id) {
  const db = getDb();
  db.prepare('DELETE FROM panel_questions WHERE id = ?').run(id);
}

function getQuestions(panelId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM panel_questions WHERE panel_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(panelId);
}

function reorderQuestions(panelId, orderedIds) {
  const db = getDb();
  const stmt = db.prepare('UPDATE panel_questions SET sort_order = ? WHERE id = ? AND panel_id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => stmt.run(idx, id, panelId));
  });
  tx();
}

async function sendPanel(guild, channel, panel) {
  const embed = panelEmbed(panel);
  const style = BUTTON_STYLES[panel.button_style] || ButtonStyle.Primary;
  const btn = new ButtonBuilder()
    .setCustomId(`panel_open_${panel.id}`)
    .setLabel(panel.button_label || 'Open Ticket')
    .setStyle(style);
  if (panel.button_emoji) {
    try { btn.setEmoji(panel.button_emoji); } catch (_) {}
  }
  const row = new ActionRowBuilder().addComponents(btn);
  const msg = await channel.send({ embeds: [embed], components: [row] });
  updatePanel(panel.id, { message_id: msg.id, channel_id: channel.id });
  return msg;
}

module.exports = {
  createPanel,
  getPanelById,
  getPanelByName,
  listPanels,
  updatePanel,
  deletePanel,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestions,
  reorderQuestions,
  sendPanel
};
