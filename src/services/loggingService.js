const { EmbedBuilder } = require('discord.js');
const { getSettings } = require('./guildSettings');
const { COLORS } = require('../config/constants');

const LOG_CHANNEL_MAP = {
  ticket_create: 'log_ticket_create',
  ticket_close: 'log_ticket_close',
  ticket_delete: 'log_ticket_delete',
  claim: 'log_claim',
  unclaim: 'log_claim',
  reopen: 'log_reopen',
  user_add: 'log_user_change',
  user_remove: 'log_user_change',
  application_create: 'log_application',
  application_decision: 'log_application',
  permission: 'log_permission',
  config: 'log_config',
  archive: 'log_archive',
  restore: 'log_restore',
  expire: 'log_expire',
  custom_command: 'log_custom_command'
};

async function logAction(guild, actionType, data = {}) {
  try {
    const settings = getSettings(guild.id);
    const channelKey = LOG_CHANNEL_MAP[actionType];
    if (!channelKey) return;
    const channelId = settings[channelKey];
    if (!channelId) return;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const embed = buildLogEmbed(actionType, data);
    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('[Logging] Failed:', err.message);
  }
}

function buildLogEmbed(actionType, data) {
  const embed = new EmbedBuilder().setTimestamp();

  switch (actionType) {
    case 'ticket_create':
      embed
        .setColor(COLORS.SUCCESS)
        .setTitle('🎫 Ticket Created')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'Panel', value: data.panel?.name || '—', inline: true },
          { name: 'Creator', value: data.actor ? `${data.actor}` : `<@${data.ticket.creator_id}>`, inline: true }
        );
      break;
    case 'ticket_close':
      embed
        .setColor(COLORS.WARNING)
        .setTitle('🔒 Ticket Closed')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'Closed By', value: `${data.actor}`, inline: true },
          { name: 'Reason', value: (data.reason || '—').slice(0, 1024), inline: false }
        );
      break;
    case 'ticket_delete':
      embed
        .setColor(COLORS.DANGER)
        .setTitle('🗑️ Ticket Deleted')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'Deleted By', value: `${data.actor}`, inline: true }
        );
      break;
    case 'claim':
      embed
        .setColor(COLORS.INFO)
        .setTitle('📌 Ticket Claimed')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'Claimed By', value: `${data.actor}`, inline: true }
        );
      break;
    case 'unclaim':
      embed
        .setColor(COLORS.INFO)
        .setTitle('📌 Ticket Unclaimed')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'By', value: `${data.actor}`, inline: true }
        );
      break;
    case 'reopen':
      embed
        .setColor(COLORS.SUCCESS)
        .setTitle('🔓 Ticket Reopened')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'By', value: `${data.actor}`, inline: true }
        );
      break;
    case 'user_add':
      embed
        .setColor(COLORS.INFO)
        .setTitle('➕ User Added to Ticket')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'User', value: `<@${data.targetId}>`, inline: true },
          { name: 'By', value: `${data.actor}`, inline: true }
        );
      break;
    case 'user_remove':
      embed
        .setColor(COLORS.WARNING)
        .setTitle('➖ User Removed from Ticket')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'User', value: `<@${data.targetId}>`, inline: true },
          { name: 'By', value: `${data.actor}`, inline: true }
        );
      break;
    case 'application_create':
      embed
        .setColor(COLORS.PRIMARY)
        .setTitle('📋 Application Submitted')
        .addFields(
          { name: 'Application', value: data.app?.name || '—', inline: true },
          { name: 'User', value: `${data.member}`, inline: true }
        );
      break;
    case 'application_decision':
      embed
        .setColor(data.status === 'accepted' ? COLORS.SUCCESS : COLORS.DANGER)
        .setTitle(data.status === 'accepted' ? '✅ Application Accepted' : '❌ Application Denied')
        .addFields(
          { name: 'By', value: `${data.actor}`, inline: true },
          { name: 'Reason', value: (data.reason || '—').slice(0, 1024), inline: false }
        );
      break;
    case 'archive':
      embed
        .setColor(COLORS.WARNING)
        .setTitle('📦 Ticket Archived')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true }
        );
      break;
    case 'restore':
      embed
        .setColor(COLORS.SUCCESS)
        .setTitle('♻️ Ticket Restored')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true },
          { name: 'By', value: `${data.actor}`, inline: true }
        );
      break;
    case 'expire':
      embed
        .setColor(COLORS.DANGER)
        .setTitle('⏳ Ticket Permanently Archived')
        .addFields(
          { name: 'Ticket', value: `#${String(data.ticket.ticket_number).padStart(4, '0')}`, inline: true }
        );
      break;
    default:
      embed.setColor(COLORS.PRIMARY).setTitle(`Log: ${actionType}`).setDescription(JSON.stringify(data).slice(0, 2000));
  }

  return embed;
}

module.exports = { logAction };
