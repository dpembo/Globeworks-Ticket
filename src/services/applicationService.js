const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const { getDb } = require('../database/db');
const { applicationEmbed } = require('../utils/embeds');
const { BUTTON_STYLES, APPLICATION_STATUS, COLORS } = require('../config/constants');
const { logAction } = require('./loggingService');

function createApplication(guildId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO applications (
      guild_id, name, description, embed_title, embed_description, embed_footer,
      embed_color, button_label, button_emoji, button_style, category_id,
      staff_role_id, review_channel_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    data.name,
    data.description || null,
    data.embed_title || data.name,
    data.embed_description || data.description || null,
    data.embed_footer || null,
    data.embed_color || '#5865F2',
    data.button_label || 'Apply',
    data.button_emoji || null,
    data.button_style || 'Primary',
    data.category_id || null,
    data.staff_role_id || null,
    data.review_channel_id || null
  );
  return getApplicationById(result.lastInsertRowid);
}

function getApplicationById(id) {
  return getDb().prepare('SELECT * FROM applications WHERE id = ?').get(id);
}

function listApplications(guildId) {
  return getDb().prepare('SELECT * FROM applications WHERE guild_id = ? ORDER BY name').all(guildId);
}

function updateApplication(id, data) {
  const db = getDb();
  const allowed = [
    'name', 'description', 'embed_title', 'embed_description', 'embed_footer',
    'embed_color', 'button_label', 'button_emoji', 'button_style', 'category_id',
    'staff_role_id', 'review_channel_id', 'enabled', 'message_id', 'channel_id'
  ];
  const updates = {};
  for (const k of allowed) {
    if (data[k] !== undefined) updates[k] = data[k];
  }
  if (!Object.keys(updates).length) return getApplicationById(id);
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE applications SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(updates), id);
  return getApplicationById(id);
}

function deleteApplication(id) {
  const db = getDb();
  db.prepare('DELETE FROM application_questions WHERE application_id = ?').run(id);
  db.prepare('DELETE FROM applications WHERE id = ?').run(id);
}

function addAppQuestion(appId, guildId, data) {
  const db = getDb();
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM application_questions WHERE application_id = ?'
  ).get(appId).m;
  const result = db.prepare(`
    INSERT INTO application_questions (application_id, guild_id, label, placeholder, required, style, min_length, max_length, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    appId, guildId, data.label, data.placeholder || null,
    data.required !== false ? 1 : 0, data.style || 'Short',
    data.min_length ?? 0, data.max_length ?? 1000, maxOrder + 1
  );
  return db.prepare('SELECT * FROM application_questions WHERE id = ?').get(result.lastInsertRowid);
}

function getAppQuestions(appId) {
  return getDb().prepare(
    'SELECT * FROM application_questions WHERE application_id = ? ORDER BY sort_order, id'
  ).all(appId);
}

function deleteAppQuestion(id) {
  getDb().prepare('DELETE FROM application_questions WHERE id = ?').run(id);
}

async function sendApplication(guild, channel, app) {
  const embed = applicationEmbed(app);
  const style = BUTTON_STYLES[app.button_style] || ButtonStyle.Primary;
  const btn = new ButtonBuilder()
    .setCustomId(`app_open_${app.id}`)
    .setLabel(app.button_label || 'Apply')
    .setStyle(style);
  if (app.button_emoji) {
    try { btn.setEmoji(app.button_emoji); } catch (_) {}
  }
  const row = new ActionRowBuilder().addComponents(btn);
  const msg = await channel.send({ embeds: [embed], components: [row] });
  updateApplication(app.id, { message_id: msg.id, channel_id: channel.id });
  return msg;
}

async function submitApplication(guild, member, app, answers) {
  const db = getDb();
  const settings = require('./guildSettings').getSettings(guild.id);

  let channel = null;
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
    },
    {
      id: guild.members.me.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
    }
  ];
  if (app.staff_role_id) {
    overwrites.push({
      id: app.staff_role_id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  channel = await guild.channels.create({
    name: `app-${member.user.username}`.slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, ''),
    type: ChannelType.GuildText,
    parent: app.category_id || undefined,
    permissionOverwrites: overwrites,
    reason: `Application from ${member.user.tag}`
  });

  const result = db.prepare(`
    INSERT INTO application_submissions (guild_id, application_id, user_id, channel_id, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(guild.id, app.id, member.id, channel.id);

  const submissionId = result.lastInsertRowid;

  const insertAns = db.prepare(`
    INSERT INTO application_responses (guild_id, submission_id, question_id, question_text, answer, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const a of answers) {
    insertAns.run(guild.id, submissionId, a.question_id || null, a.question_text, a.answer, member.id);
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`Application: ${app.name}`)
    .setDescription(`Submitted by ${member}`)
    .setTimestamp();

  for (const a of answers) {
    embed.addFields({ name: a.question_text.slice(0, 256), value: a.answer.slice(0, 1024), inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_accept_${submissionId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`app_deny_${submissionId}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('❌'),
    new ButtonBuilder().setCustomId(`app_review_${submissionId}`).setLabel('Assign Me').setStyle(ButtonStyle.Secondary).setEmoji('👤')
  );

  await channel.send({ embeds: [embed], components: [row] });

  if (app.review_channel_id) {
    const reviewCh = await guild.channels.fetch(app.review_channel_id).catch(() => null);
    if (reviewCh) {
      await reviewCh.send({
        content: `New application from ${member} for **${app.name}**: ${channel}`,
        embeds: [embed]
      }).catch(() => {});
    }
  }

  await logAction(guild, 'application_create', { app, member: member.user, submissionId });
  return { submissionId, channel };
}

function getSubmission(id) {
  return getDb().prepare('SELECT * FROM application_submissions WHERE id = ?').get(id);
}

function getSubmissionResponses(submissionId) {
  return getDb().prepare(
    'SELECT * FROM application_responses WHERE submission_id = ? ORDER BY id'
  ).all(submissionId);
}

async function decideApplication(submission, member, guild, status, reason = '') {
  const db = getDb();
  if (submission.status !== APPLICATION_STATUS.PENDING) {
    throw new Error('Application already decided.');
  }

  db.prepare(`
    UPDATE application_submissions SET
      status = ?, reviewer_id = ?, decision_reason = ?, decided_at = datetime('now')
    WHERE id = ?
  `).run(status, member.id, reason, submission.id);

  const ch = await guild.channels.fetch(submission.channel_id).catch(() => null);
  if (ch) {
    const embed = new EmbedBuilder()
      .setColor(status === APPLICATION_STATUS.ACCEPTED ? COLORS.SUCCESS : COLORS.DANGER)
      .setTitle(status === APPLICATION_STATUS.ACCEPTED ? 'Application Accepted' : 'Application Denied')
      .setDescription(`Reviewed by ${member}${reason ? `\n\n**Reason:** ${reason}` : ''}`)
      .setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  }

  await logAction(guild, 'application_decision', {
    submission,
    actor: member.user,
    status,
    reason
  });
}

module.exports = {
  createApplication,
  getApplicationById,
  listApplications,
  updateApplication,
  deleteApplication,
  addAppQuestion,
  getAppQuestions,
  deleteAppQuestion,
  sendApplication,
  submitApplication,
  getSubmission,
  getSubmissionResponses,
  decideApplication
};
