const { getDb } = require('../database/db');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { COLORS } = require('../config/constants');

function createCommand(guildId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO custom_commands (
      guild_id, name, description, enabled, response_type,
      embed_title, embed_description, embed_footer, embed_color,
      embed_thumbnail, embed_image, embed_author, embed_timestamp,
      ephemeral, required_roles, required_permissions, creator_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    data.name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32),
    data.description || 'Custom command',
    data.enabled !== false ? 1 : 0,
    data.response_type || 'embed',
    data.embed_title || null,
    data.embed_description || null,
    data.embed_footer || null,
    data.embed_color || '#5865F2',
    data.embed_thumbnail || null,
    data.embed_image || null,
    data.embed_author || null,
    data.embed_timestamp ? 1 : 0,
    data.ephemeral ? 1 : 0,
    data.required_roles || null,
    data.required_permissions || null,
    data.creator_id || null
  );
  return getCommandById(result.lastInsertRowid);
}

function getCommandById(id) {
  return getDb().prepare('SELECT * FROM custom_commands WHERE id = ?').get(id);
}

function getCommandByName(guildId, name) {
  return getDb().prepare(
    'SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?'
  ).get(guildId, name);
}

function listCommands(guildId) {
  return getDb().prepare(
    'SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY name'
  ).all(guildId);
}

function updateCommand(id, data) {
  const db = getDb();
  const allowed = [
    'name', 'description', 'enabled', 'response_type', 'embed_title',
    'embed_description', 'embed_footer', 'embed_color', 'embed_thumbnail',
    'embed_image', 'embed_author', 'embed_timestamp', 'ephemeral',
    'required_roles', 'required_permissions'
  ];
  const updates = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updates[k] = data[k];
  }
  if (!Object.keys(updates).length) return getCommandById(id);
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(
    `UPDATE custom_commands SET ${sets}, updated_at = datetime('now') WHERE id = ?`
  ).run(...Object.values(updates), id);
  return getCommandById(id);
}

function deleteCommand(id) {
  const db = getDb();
  db.prepare('DELETE FROM custom_command_fields WHERE command_id = ?').run(id);
  db.prepare('DELETE FROM custom_command_buttons WHERE command_id = ?').run(id);
  db.prepare('DELETE FROM custom_commands WHERE id = ?').run(id);
}

function addField(commandId, guildId, name, value, inline = false) {
  const db = getDb();
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM custom_command_fields WHERE command_id = ?'
  ).get(commandId).m;
  db.prepare(`
    INSERT INTO custom_command_fields (command_id, guild_id, name, value, inline, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(commandId, guildId, name, value, inline ? 1 : 0, maxOrder + 1);
}

function getFields(commandId) {
  return getDb().prepare(
    'SELECT * FROM custom_command_fields WHERE command_id = ? ORDER BY sort_order'
  ).all(commandId);
}

function deleteField(id) {
  getDb().prepare('DELETE FROM custom_command_fields WHERE id = ?').run(id);
}

function addButton(commandId, guildId, label, url, style = 'Link', emoji = null) {
  const db = getDb();
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM custom_command_buttons WHERE command_id = ?'
  ).get(commandId).m;
  db.prepare(`
    INSERT INTO custom_command_buttons (command_id, guild_id, label, url, style, emoji, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(commandId, guildId, label, url, style, emoji, maxOrder + 1);
}

function getButtons(commandId) {
  return getDb().prepare(
    'SELECT * FROM custom_command_buttons WHERE command_id = ? ORDER BY sort_order'
  ).all(commandId);
}

function deleteButton(id) {
  getDb().prepare('DELETE FROM custom_command_buttons WHERE id = ?').run(id);
}

function buildResponse(command) {
  const fields = getFields(command.id);
  const buttons = getButtons(command.id);

  const embed = new EmbedBuilder();
  if (command.embed_title) embed.setTitle(command.embed_title);
  if (command.embed_description) embed.setDescription(command.embed_description);
  if (command.embed_footer) embed.setFooter({ text: command.embed_footer });
  if (command.embed_color) {
    try {
      embed.setColor(parseInt(command.embed_color.replace('#', ''), 16));
    } catch (_) {
      embed.setColor(COLORS.PRIMARY);
    }
  } else {
    embed.setColor(COLORS.PRIMARY);
  }
  if (command.embed_thumbnail) embed.setThumbnail(command.embed_thumbnail);
  if (command.embed_image) embed.setImage(command.embed_image);
  if (command.embed_author) embed.setAuthor({ name: command.embed_author });
  if (command.embed_timestamp) embed.setTimestamp();

  for (const f of fields) {
    embed.addFields({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024), inline: !!f.inline });
  }

  const components = [];
  if (buttons.length > 0) {
    const row = new ActionRowBuilder();
    for (const b of buttons.slice(0, 5)) {
      if (b.url) {
        const btn = new ButtonBuilder()
          .setLabel(b.label.slice(0, 80))
          .setStyle(ButtonStyle.Link)
          .setURL(b.url);
        if (b.emoji) {
          try { btn.setEmoji(b.emoji); } catch (_) {}
        }
        row.addComponents(btn);
      }
    }
    if (row.components.length) components.push(row);
  }

  return {
    embeds: [embed],
    components,
    ephemeral: !!command.ephemeral
  };
}

module.exports = {
  createCommand,
  getCommandById,
  getCommandByName,
  listCommands,
  updateCommand,
  deleteCommand,
  addField,
  getFields,
  deleteField,
  addButton,
  getButtons,
  deleteButton,
  buildResponse
};
