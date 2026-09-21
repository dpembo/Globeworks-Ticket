const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  OverwriteType
} = require('discord.js');
const { getDb } = require('../database/db');
const { nextTicketNumber, getSettings } = require('./guildSettings');
const { ticketEmbed } = require('../utils/embeds');
const { TICKET_STATUS, COLORS } = require('../config/constants');
const { logAction } = require('./loggingService');

function getTicketByChannel(guildId, channelId) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM tickets WHERE guild_id = ? AND (channel_id = ? OR thread_id = ?) AND status != 'permanent'`
  ).get(guildId, channelId, channelId);
}

function getTicketByNumber(guildId, number) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM tickets WHERE guild_id = ? AND ticket_number = ?`
  ).get(guildId, number);
}

function getTicketById(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
}

function getOpenTicketsByUser(guildId, userId, panelId = null) {
  const db = getDb();
  if (panelId) {
    return db.prepare(
      `SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND panel_id = ? AND status = 'open'`
    ).all(guildId, userId, panelId);
  }
  return db.prepare(
    `SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open'`
  ).all(guildId, userId);
}

function getFormResponses(ticketId) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM form_responses WHERE ticket_id = ? ORDER BY id ASC`
  ).all(ticketId);
}

function getPanel(panelId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM panels WHERE id = ?`).get(panelId);
}

function getPanelQuestions(panelId) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM panel_questions WHERE panel_id = ? ORDER BY sort_order ASC, id ASC`
  ).all(panelId);
}

function countOpenTickets(guildId, userId, panelId) {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND creator_id = ? AND panel_id = ? AND status = 'open'`
  ).get(guildId, userId, panelId);
  return row.c;
}

async function createTicket(guild, member, panel, answers = []) {
  const db = getDb();
  const settings = getSettings(guild.id);
  const ticketNumber = nextTicketNumber(guild.id);
  const formatted = String(ticketNumber).padStart(4, '0');

  let naming = (panel.naming_format || 'ticket-{number}')
    .replace('{number}', formatted)
    .replace('{user}', member.user.username.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .slice(0, 90);

  const staffRoleId = panel.staff_role_id || settings.support_role_id;
  const categoryId = panel.category_id || settings.ticket_category_id;

  let channel = null;
  let thread = null;

  try {
    if (panel.use_thread) {
      // Create a private thread in a parent channel (use category channel or system channel)
      let parentChannel = null;
      if (categoryId) {
        const cat = await guild.channels.fetch(categoryId).catch(() => null);
        if (cat && cat.type === ChannelType.GuildCategory) {
          // Find first text channel in category or create temporary
          parentChannel = guild.channels.cache.find(
            c => c.parentId === categoryId && c.type === ChannelType.GuildText
          );
        } else if (cat && cat.isTextBased()) {
          parentChannel = cat;
        }
      }
      if (!parentChannel) {
        parentChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.viewable);
      }
      if (!parentChannel) {
        throw new Error('No suitable parent channel found for thread tickets. Configure a category or text channel.');
      }

      thread = await parentChannel.threads.create({
        name: naming,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: `Ticket #${formatted} by ${member.user.tag}`
      });

      await thread.members.add(member.id).catch(() => {});
      if (staffRoleId) {
        // Threads don't support role overwrites the same way; invite staff manually via members
        const role = await guild.roles.fetch(staffRoleId).catch(() => null);
        if (role) {
          for (const [, m] of role.members) {
            await thread.members.add(m.id).catch(() => {});
          }
        }
      }
    } else {
      const overwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
          type: OverwriteType.Role
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ],
          type: OverwriteType.Member
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ReadMessageHistory
          ],
          type: OverwriteType.Member
        }
      ];

      if (staffRoleId) {
        overwrites.push({
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageMessages
          ],
          type: OverwriteType.Role
        });
      }

      channel = await guild.channels.create({
        name: naming,
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        permissionOverwrites: overwrites,
        reason: `Ticket #${formatted} by ${member.user.tag}`
      });
    }

    const targetId = channel?.id || thread?.id;

    const insert = db.prepare(`
      INSERT INTO tickets (
        guild_id, ticket_number, channel_id, thread_id, panel_id,
        creator_id, status, ticket_type, custom_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, datetime('now'), datetime('now'))
    `);

    const result = insert.run(
      guild.id,
      ticketNumber,
      channel?.id || null,
      thread?.id || null,
      panel.id,
      member.id,
      panel.name,
      naming
    );

    const ticketId = result.lastInsertRowid;

    // Save form responses
    if (answers.length > 0) {
      const insertAnswer = db.prepare(`
        INSERT INTO form_responses (guild_id, ticket_id, panel_id, question_id, question_text, answer, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of answers) {
        insertAnswer.run(
          guild.id,
          ticketId,
          panel.id,
          a.question_id || null,
          a.question_text,
          a.answer,
          member.id
        );
      }
    }

    // Add creator as member
    db.prepare(
      `INSERT OR IGNORE INTO ticket_members (ticket_id, guild_id, user_id, added_by) VALUES (?, ?, ?, ?)`
    ).run(ticketId, guild.id, member.id, member.id);

    const ticket = getTicketById(ticketId);
    const responses = getFormResponses(ticketId);
    const embed = ticketEmbed(ticket, panel, responses);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('📌'),
      new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId(`ticket_info_${ticketId}`).setLabel('Info').setStyle(ButtonStyle.Secondary).setEmoji('ℹ️')
    );

    const target = channel || thread;
    await target.send({
      content: `${member} ${staffRoleId ? `<@&${staffRoleId}>` : ''}`,
      embeds: [embed],
      components: [row]
    });

    await logAction(guild, 'ticket_create', {
      ticket,
      panel,
      actor: member.user
    });

    return { ticket, channel, thread };
  } catch (err) {
    // Cleanup on failure
    if (channel) await channel.delete().catch(() => {});
    if (thread) await thread.delete().catch(() => {});
    throw err;
  }
}

async function claimTicket(ticket, member, guild) {
  const db = getDb();
  if (ticket.status !== TICKET_STATUS.OPEN) {
    throw new Error('Ticket is not open.');
  }
  if (ticket.claimant_id) {
    throw new Error(`Ticket is already claimed by <@${ticket.claimant_id}>.`);
  }

  db.prepare(
    `UPDATE tickets SET claimant_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(member.id, ticket.id);

  const updated = getTicketById(ticket.id);
  await updateTicketMessage(guild, updated);
  await logAction(guild, 'claim', { ticket: updated, actor: member.user });
  return updated;
}

async function unclaimTicket(ticket, member, guild) {
  const db = getDb();
  if (!ticket.claimant_id) {
    throw new Error('Ticket is not claimed.');
  }
  if (ticket.claimant_id !== member.id && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    // Allow if has unclaim permission (checked by caller)
  }

  db.prepare(
    `UPDATE tickets SET claimant_id = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(ticket.id);

  const updated = getTicketById(ticket.id);
  await updateTicketMessage(guild, updated);
  await logAction(guild, 'unclaim', { ticket: updated, actor: member.user });
  return updated;
}

async function closeTicket(ticket, member, guild, reason = 'No reason provided') {
  const db = getDb();
  if (ticket.status !== TICKET_STATUS.OPEN) {
    throw new Error('Ticket is not open.');
  }

  const settings = getSettings(guild.id);
  const recoveryDays = settings.recovery_days || 21;
  const expires = new Date();
  expires.setDate(expires.getDate() + recoveryDays);

  db.prepare(`
    UPDATE tickets SET
      status = 'closed',
      close_reason = ?,
      closed_by = ?,
      closed_at = datetime('now'),
      recovery_expires_at = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(reason, member.id, expires.toISOString(), ticket.id);

  const updated = getTicketById(ticket.id);

  // Archive to forum if configured
  if (settings.archive_forum_id) {
    try {
      await archiveToForum(guild, updated, settings);
    } catch (e) {
      console.error('[Ticket] Archive to forum failed:', e.message);
    }
  }

  // Auto transcript
  if (settings.auto_transcript && settings.transcript_channel_id) {
    try {
      const { generateTranscript } = require('./transcriptService');
      await generateTranscript(guild, updated, settings.transcript_channel_id);
    } catch (e) {
      console.error('[Ticket] Transcript failed:', e.message);
    }
  }

  // Lock channel/thread
  try {
    const ch = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
    if (ch) {
      if (ch.isThread()) {
        await ch.setLocked(true).catch(() => {});
        await ch.setArchived(true).catch(() => {});
      } else {
        await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});
        await ch.setName(`closed-${ch.name}`.slice(0, 100)).catch(() => {});
      }
    }
  } catch (_) {}

  await logAction(guild, 'ticket_close', { ticket: updated, actor: member.user, reason });
  return updated;
}

async function reopenTicket(ticket, member, guild) {
  const db = getDb();
  if (ticket.status !== TICKET_STATUS.CLOSED && ticket.status !== TICKET_STATUS.ARCHIVED) {
    throw new Error('Ticket cannot be reopened from current status.');
  }

  db.prepare(`
    UPDATE tickets SET
      status = 'open',
      close_reason = NULL,
      closed_by = NULL,
      closed_at = NULL,
      recovery_expires_at = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(ticket.id);

  const updated = getTicketById(ticket.id);

  try {
    const ch = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
    if (ch) {
      if (ch.isThread()) {
        await ch.setArchived(false).catch(() => {});
        await ch.setLocked(false).catch(() => {});
      } else {
        await ch.permissionOverwrites.edit(guild.id, { SendMessages: null }).catch(() => {});
        const name = ch.name.replace(/^closed-/, '');
        await ch.setName(name).catch(() => {});
      }
    }
  } catch (_) {}

  await logAction(guild, 'reopen', { ticket: updated, actor: member.user });
  return updated;
}

async function addUserToTicket(ticket, targetUserId, actor, guild) {
  const db = getDb();
  const ch = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
  if (!ch) throw new Error('Ticket channel not found.');

  if (ch.isThread()) {
    await ch.members.add(targetUserId);
  } else {
    await ch.permissionOverwrites.edit(targetUserId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });
  }

  db.prepare(
    `INSERT OR IGNORE INTO ticket_members (ticket_id, guild_id, user_id, added_by) VALUES (?, ?, ?, ?)`
  ).run(ticket.id, guild.id, targetUserId, actor.id);

  await logAction(guild, 'user_add', { ticket, actor: actor.user || actor, targetId: targetUserId });
}

async function removeUserFromTicket(ticket, targetUserId, actor, guild) {
  const db = getDb();
  if (targetUserId === ticket.creator_id) {
    throw new Error('Cannot remove the ticket creator.');
  }

  const ch = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
  if (!ch) throw new Error('Ticket channel not found.');

  if (ch.isThread()) {
    await ch.members.remove(targetUserId).catch(() => {});
  } else {
    await ch.permissionOverwrites.delete(targetUserId).catch(() => {});
  }

  db.prepare(
    `DELETE FROM ticket_members WHERE ticket_id = ? AND user_id = ?`
  ).run(ticket.id, targetUserId);

  await logAction(guild, 'user_remove', { ticket, actor: actor.user || actor, targetId: targetUserId });
}

async function renameTicket(ticket, newName, guild) {
  const db = getDb();
  const ch = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
  if (!ch) throw new Error('Ticket channel not found.');

  const safe = newName.slice(0, 100);
  await ch.setName(safe);
  db.prepare(
    `UPDATE tickets SET custom_name = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(safe, ticket.id);
  return getTicketById(ticket.id);
}

async function deleteTicket(ticket, member, guild) {
  const db = getDb();
  const ch = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
  if (ch) {
    await ch.delete(`Ticket deleted by ${member.user.tag}`).catch(() => {});
  }

  db.prepare(
    `UPDATE tickets SET status = 'permanent', updated_at = datetime('now') WHERE id = ?`
  ).run(ticket.id);

  await logAction(guild, 'ticket_delete', { ticket, actor: member.user });
}

async function archiveToForum(guild, ticket, settings) {
  const forum = await guild.channels.fetch(settings.archive_forum_id).catch(() => null);
  if (!forum || forum.type !== ChannelType.GuildForum) return;

  const panel = ticket.panel_id ? getPanel(ticket.panel_id) : null;
  const responses = getFormResponses(ticket.id);

  const embed = ticketEmbed(ticket, panel, responses);
  embed.setTitle(`📦 Archived Ticket #${String(ticket.ticket_number).padStart(4, '0')}`);
  if (ticket.recovery_expires_at) {
    embed.addFields({
      name: 'Recovery Expires',
      value: `<t:${Math.floor(new Date(ticket.recovery_expires_at).getTime() / 1000)}:F>`,
      inline: false
    });
  }

  const post = await forum.threads.create({
    name: `Ticket #${String(ticket.ticket_number).padStart(4, '0')} - ${ticket.ticket_type || 'General'}`,
    message: { embeds: [embed] },
    reason: 'Ticket archive'
  });

  const db = getDb();
  db.prepare(
    `UPDATE tickets SET archive_forum_post_id = ?, status = 'archived', updated_at = datetime('now') WHERE id = ?`
  ).run(post.id, ticket.id);

  await logAction(guild, 'archive', { ticket: getTicketById(ticket.id) });
}

async function restoreArchivedTicket(ticket, member, guild) {
  const db = getDb();
  const settings = getSettings(guild.id);

  if (ticket.status !== TICKET_STATUS.ARCHIVED && ticket.status !== TICKET_STATUS.CLOSED) {
    throw new Error('Ticket is not recoverable.');
  }

  if (ticket.recovery_expires_at && new Date(ticket.recovery_expires_at) < new Date()) {
    throw new Error('Recovery period has expired. This ticket can no longer be restored.');
  }

  // Prefer reusing existing channel if still exists
  let channel = null;
  if (ticket.channel_id) {
    channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  }
  if (ticket.thread_id && !channel) {
    channel = await guild.channels.fetch(ticket.thread_id).catch(() => null);
  }

  const panel = ticket.panel_id ? getPanel(ticket.panel_id) : null;
  const staffRoleId = panel?.staff_role_id || settings.support_role_id;

  if (!channel) {
    // Recreate channel
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: ticket.creator_id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
      },
      {
        id: guild.members.me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages]
      }
    ];
    if (staffRoleId) {
      overwrites.push({
        id: staffRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
      });
    }

    channel = await guild.channels.create({
      name: ticket.custom_name || `ticket-${String(ticket.ticket_number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: panel?.category_id || settings.ticket_category_id || undefined,
      permissionOverwrites: overwrites,
      reason: `Restored ticket #${ticket.ticket_number}`
    });
  } else {
    if (channel.isThread()) {
      await channel.setArchived(false).catch(() => {});
      await channel.setLocked(false).catch(() => {});
    } else {
      await channel.permissionOverwrites.edit(guild.id, { SendMessages: null }).catch(() => {});
    }
  }

  db.prepare(`
    UPDATE tickets SET
      status = 'open',
      channel_id = ?,
      close_reason = NULL,
      closed_by = NULL,
      closed_at = NULL,
      recovery_expires_at = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(channel.id, ticket.id);

  const updated = getTicketById(ticket.id);
  const responses = getFormResponses(ticket.id);
  const embed = ticketEmbed(updated, panel, responses);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticket.id}`).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('📌'),
    new ButtonBuilder().setCustomId(`ticket_close_${ticket.id}`).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId(`ticket_info_${ticket.id}`).setLabel('Info').setStyle(ButtonStyle.Secondary).setEmoji('ℹ️')
  );

  await channel.send({
    content: `Ticket restored by ${member}. Original creator: <@${ticket.creator_id}>`,
    embeds: [embed],
    components: [row]
  });

  // Update forum post if exists
  if (ticket.archive_forum_post_id) {
    try {
      const forumPost = await guild.channels.fetch(ticket.archive_forum_post_id).catch(() => null);
      if (forumPost) {
        await forumPost.send({ content: `✅ Restored by ${member} at <t:${Math.floor(Date.now() / 1000)}:F>` }).catch(() => {});
      }
    } catch (_) {}
  }

  await logAction(guild, 'restore', { ticket: updated, actor: member.user });
  return updated;
}

async function updateTicketMessage(guild, ticket) {
  // Best-effort: find first bot message with embed in channel and edit
  try {
    const ch = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
    if (!ch) return;
    const messages = await ch.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === guild.members.me.id && m.embeds.length > 0);
    if (!botMsg) return;
    const panel = ticket.panel_id ? getPanel(ticket.panel_id) : null;
    const responses = getFormResponses(ticket.id);
    const embed = ticketEmbed(ticket, panel, responses);
    await botMsg.edit({ embeds: [embed] }).catch(() => {});
  } catch (_) {}
}

function listArchived(guildId, { limit = 25, offset = 0, search = null } = {}) {
  const db = getDb();
  let sql = `SELECT * FROM tickets WHERE guild_id = ? AND status IN ('closed', 'archived')`;
  const params = [guildId];
  if (search) {
    sql += ` AND (CAST(ticket_number AS TEXT) LIKE ? OR custom_name LIKE ? OR creator_id = ?)`;
    params.push(`%${search}%`, `%${search}%`, search);
  }
  sql += ` ORDER BY closed_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

function processExpiredArchives() {
  const db = getDb();
  const now = new Date().toISOString();
  const expired = db.prepare(
    `SELECT * FROM tickets WHERE status IN ('closed', 'archived') AND recovery_expires_at IS NOT NULL AND recovery_expires_at < ?`
  ).all(now);

  for (const t of expired) {
    db.prepare(
      `UPDATE tickets SET status = 'permanent', updated_at = datetime('now') WHERE id = ?`
    ).run(t.id);
    console.log(`[Archive] Ticket #${t.ticket_number} (guild ${t.guild_id}) permanently archived (expired).`);
  }
  return expired.length;
}

module.exports = {
  getTicketByChannel,
  getTicketByNumber,
  getTicketById,
  getOpenTicketsByUser,
  getFormResponses,
  getPanel,
  getPanelQuestions,
  countOpenTickets,
  createTicket,
  claimTicket,
  unclaimTicket,
  closeTicket,
  reopenTicket,
  addUserToTicket,
  removeUserFromTicket,
  renameTicket,
  deleteTicket,
  archiveToForum,
  restoreArchivedTicket,
  updateTicketMessage,
  listArchived,
  processExpiredArchives
};
