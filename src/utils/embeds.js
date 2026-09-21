const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../config/constants');

function baseEmbed(title, description, color = COLORS.PRIMARY) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp();
}

function successEmbed(title, description) {
  return baseEmbed(title, description, COLORS.SUCCESS);
}

function errorEmbed(title, description) {
  return baseEmbed(title || 'Error', description, COLORS.DANGER);
}

function infoEmbed(title, description) {
  return baseEmbed(title, description, COLORS.INFO);
}

function warningEmbed(title, description) {
  return baseEmbed(title, description, COLORS.WARNING);
}

function ticketEmbed(ticket, panel, responses = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`Ticket #${String(ticket.ticket_number).padStart(4, '0')}`)
    .setTimestamp(new Date(ticket.created_at));

  const fields = [
    { name: 'Creator', value: `<@${ticket.creator_id}>`, inline: true },
    { name: 'Status', value: ticket.status.toUpperCase(), inline: true },
    { name: 'Type', value: ticket.ticket_type || panel?.name || 'General', inline: true }
  ];

  if (ticket.claimant_id) {
    fields.push({ name: 'Claimed By', value: `<@${ticket.claimant_id}>`, inline: true });
  }

  if (ticket.closed_by) {
    fields.push({ name: 'Closed By', value: `<@${ticket.closed_by}>`, inline: true });
  }

  if (ticket.close_reason) {
    fields.push({ name: 'Close Reason', value: ticket.close_reason.slice(0, 1024), inline: false });
  }

  if (responses.length > 0) {
    for (const r of responses) {
      fields.push({
        name: r.question_text.slice(0, 256),
        value: (r.answer || '—').slice(0, 1024),
        inline: false
      });
    }
  }

  embed.addFields(fields);
  if (panel?.embed_footer) embed.setFooter({ text: panel.embed_footer });
  return embed;
}

function panelEmbed(panel) {
  const embed = new EmbedBuilder()
    .setColor(panel.embed_color ? parseInt(panel.embed_color.replace('#', ''), 16) : COLORS.PRIMARY)
    .setTitle(panel.embed_title || panel.name)
    .setDescription(panel.embed_description || panel.description || 'Click the button below to open a ticket.');

  if (panel.embed_footer) embed.setFooter({ text: panel.embed_footer });
  return embed;
}

function applicationEmbed(app) {
  const embed = new EmbedBuilder()
    .setColor(app.embed_color ? parseInt(app.embed_color.replace('#', ''), 16) : COLORS.PRIMARY)
    .setTitle(app.embed_title || app.name)
    .setDescription(app.embed_description || app.description || 'Click the button below to apply.');

  if (app.embed_footer) embed.setFooter({ text: app.embed_footer });
  return embed;
}

function controlPanelEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🌐 GlobeWorks Ticket Control Panel')
    .setDescription(
      'Select a category below to manage tickets, panels, applications, archives, permissions, logging, custom commands, and configuration.\n\n' +
      'All configuration is done entirely through Discord — no external dashboard required.'
    )
    .addFields(
      { name: '🎫 Tickets', value: 'Create, close, claim, manage tickets', inline: true },
      { name: '🎟️ Panels', value: 'Ticket panel management', inline: true },
      { name: '📋 Applications', value: 'Staff application system', inline: true },
      { name: '📦 Archives', value: 'Browse & recover archived tickets', inline: true },
      { name: '🔐 Permissions', value: 'Role-based access control', inline: true },
      { name: '📜 Logging', value: 'Configure log channels', inline: true },
      { name: '🛠️ Custom Commands', value: 'Create custom slash responses', inline: true },
      { name: '⚙️ Configuration', value: 'General bot settings', inline: true }
    )
    .setFooter({ text: 'GlobeWorks Ticket System' })
    .setTimestamp();
}

module.exports = {
  baseEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed,
  warningEmbed,
  ticketEmbed,
  panelEmbed,
  applicationEmbed,
  controlPanelEmbed
};
