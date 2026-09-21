const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder
} = require('discord.js');
const ticketService = require('../../services/ticketService');
const panelService = require('../../services/panelService');
const applicationService = require('../../services/applicationService');
const customCommandService = require('../../services/customCommandService');
const { getSettings, resetSettings } = require('../../services/guildSettings');
const { memberHasPermission, hasDiscordAdmin, setRolePermission, getRolePermissions } = require('../../utils/permissions');
const { PERMISSIONS, PERMISSION_LABELS } = require('../../config/constants');
const { successEmbed, errorEmbed, infoEmbed, ticketEmbed } = require('../../utils/embeds');
const {
  buildMainPanel,
  ticketsMenu,
  panelsMenu,
  applicationsMenu,
  archivesMenu,
  configMenu,
  loggingMenu,
  customCommandsMenu
} = require('../../builders/controlPanel');

const pendingForms = new Map();

async function handleCustomCommandRun(interaction, cmd) {
  if (cmd.required_roles) {
    const roles = cmd.required_roles.split(',').map(s => s.trim()).filter(Boolean);
    const has = roles.some(r => interaction.member.roles.cache.has(r));
    if (!has && !hasDiscordAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Permission Denied', 'You do not have the required role.')], ephemeral: true });
    }
  }
  const response = customCommandService.buildResponse(cmd);
  return interaction.reply(response);
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === 'cp_main') return interaction.update(buildMainPanel(interaction.member));
  if (id === 'cp_tickets') {
    return interaction.update({ embeds: [infoEmbed('🎫 Tickets', 'Select an action below or use slash commands inside a ticket.')], components: ticketsMenu() });
  }
  if (id === 'cp_panels') {
    return interaction.update({ embeds: [infoEmbed('🎟️ Ticket Panels', 'Manage ticket panels.')], components: panelsMenu() });
  }
  if (id === 'cp_applications') {
    return interaction.update({ embeds: [infoEmbed('📋 Applications', 'Manage applications.')], components: applicationsMenu() });
  }
  if (id === 'cp_archives') {
    return interaction.update({ embeds: [infoEmbed('📦 Archives', 'Browse and recover tickets.')], components: archivesMenu() });
  }
  if (id === 'cp_permissions') {
    if (!hasDiscordAdmin(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Admin only')], ephemeral: true });
    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('perm_role_select').setPlaceholder('Select a role').setMinValues(1).setMaxValues(1)
    );
    return interaction.update({
      embeds: [infoEmbed('🔐 Permissions', 'Select a role to configure.')],
      components: [row, new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cp_main').setLabel('Main Menu').setStyle(ButtonStyle.Primary).setEmoji('🏠'))]
    });
  }
  if (id === 'cp_logging') {
    return interaction.update({ embeds: [infoEmbed('📜 Logging', 'Select a log type.')], components: loggingMenu() });
  }
  if (id === 'cp_custom') {
    return interaction.update({ embeds: [infoEmbed('🛠️ Custom Commands', 'Manage custom commands.')], components: customCommandsMenu() });
  }
  if (id === 'cp_config') {
    return interaction.update({ embeds: [infoEmbed('⚙️ Configuration', 'Select a setting.')], components: configMenu() });
  }
  if (id === 'cp_archive_browse') {
    const tickets = ticketService.listArchived(interaction.guildId, { limit: 15 });
    const text = tickets.length
      ? tickets.map(t => `\`#${String(t.ticket_number).padStart(4, '0')}\` <@${t.creator_id}> — ${t.status}`).join('\n')
      : 'No archived tickets.';
    return interaction.update({
      embeds: [infoEmbed('📦 Archived Tickets', text)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cp_archives').setLabel('Back').setStyle(ButtonStyle.Secondary))]
    });
  }
  if (id === 'cp_archive_search') {
    const modal = new ModalBuilder().setCustomId('archive_search_modal').setTitle('Search Archives');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('query').setLabel('Ticket number or user ID').setStyle(TextInputStyle.Short).setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  if (id.startsWith('ticket_claim_')) {
    const ticketId = parseInt(id.replace('ticket_claim_', ''), 10);
    const ticket = ticketService.getTicketById(ticketId);
    if (!ticket || ticket.guild_id !== interaction.guildId) throw new Error('Ticket not found.');
    if (!memberHasPermission(interaction.member, PERMISSIONS.CLAIM)) throw new Error('No permission to claim.');
    await ticketService.claimTicket(ticket, interaction.member, interaction.guild);
    return interaction.reply({ embeds: [successEmbed('Claimed', `You claimed #${String(ticket.ticket_number).padStart(4, '0')}.`)] });
  }

  if (id.startsWith('ticket_close_')) {
    const ticketId = parseInt(id.replace('ticket_close_', ''), 10);
    const ticket = ticketService.getTicketById(ticketId);
    if (!ticket || ticket.guild_id !== interaction.guildId) throw new Error('Ticket not found.');
    if (!memberHasPermission(interaction.member, PERMISSIONS.CLOSE) && ticket.creator_id !== interaction.user.id) {
      throw new Error('No permission to close.');
    }
    const modal = new ModalBuilder().setCustomId(`close_modal_${ticketId}`).setTitle('Close Ticket');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Close reason').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
    ));
    return interaction.showModal(modal);
  }

  if (id.startsWith('ticket_info_')) {
    const ticketId = parseInt(id.replace('ticket_info_', ''), 10);
    const ticket = ticketService.getTicketById(ticketId);
    if (!ticket || ticket.guild_id !== interaction.guildId) throw new Error('Ticket not found.');
    const panel = ticket.panel_id ? ticketService.getPanel(ticket.panel_id) : null;
    const responses = ticketService.getFormResponses(ticket.id);
    return interaction.reply({ embeds: [ticketEmbed(ticket, panel, responses)], ephemeral: true });
  }

  if (id.startsWith('panel_open_')) {
    const panelId = parseInt(id.replace('panel_open_', ''), 10);
    const panel = panelService.getPanelById(panelId);
    if (!panel || panel.guild_id !== interaction.guildId || !panel.enabled) throw new Error('Panel not available.');

    const openCount = ticketService.countOpenTickets(interaction.guildId, interaction.user.id, panel.id);
    if (openCount >= (panel.max_open_per_user || 1)) {
      throw new Error(`You already have ${openCount} open ticket(s) (max: ${panel.max_open_per_user}).`);
    }

    const questions = panelService.getQuestions(panel.id);
    if (questions.length === 0) {
      await interaction.deferReply({ ephemeral: true });
      const result = await ticketService.createTicket(interaction.guild, interaction.member, panel, []);
      const target = result.channel || result.thread;
      return interaction.editReply({ embeds: [successEmbed('Ticket Created', `Your ticket: ${target}`)] });
    }
    return showQuestionModal(interaction, panel, questions, 0, []);
  }

  if (id.startsWith('app_open_')) {
    const appId = parseInt(id.replace('app_open_', ''), 10);
    const app = applicationService.getApplicationById(appId);
    if (!app || app.guild_id !== interaction.guildId || !app.enabled) throw new Error('Application not available.');
    const questions = applicationService.getAppQuestions(app.id);
    if (!questions.length) throw new Error('No questions configured.');
    return showAppQuestionModal(interaction, app, questions, 0, []);
  }

  if (id.startsWith('app_accept_') || id.startsWith('app_deny_')) {
    const accept = id.startsWith('app_accept_');
    const subId = parseInt(id.replace(accept ? 'app_accept_' : 'app_deny_', ''), 10);
    const submission = applicationService.getSubmission(subId);
    if (!submission || submission.guild_id !== interaction.guildId) throw new Error('Submission not found.');
    const perm = accept ? PERMISSIONS.ACCEPT_APPLICATIONS : PERMISSIONS.DENY_APPLICATIONS;
    if (!memberHasPermission(interaction.member, perm) && !hasDiscordAdmin(interaction.member)) throw new Error('No permission.');
    const modal = new ModalBuilder()
      .setCustomId(`app_decide_${accept ? 'accept' : 'deny'}_${subId}`)
      .setTitle(accept ? 'Accept Application' : 'Deny Application');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false)
    ));
    return interaction.showModal(modal);
  }

  if (id.startsWith('app_review_')) {
    const subId = parseInt(id.replace('app_review_', ''), 10);
    if (!memberHasPermission(interaction.member, PERMISSIONS.REVIEW_APPLICATIONS) && !hasDiscordAdmin(interaction.member)) {
      throw new Error('No permission.');
    }
    const { getDb } = require('../../database/db');
    getDb().prepare('UPDATE application_submissions SET reviewer_id = ? WHERE id = ?').run(interaction.user.id, subId);
    return interaction.reply({ embeds: [successEmbed('Assigned', 'You are now reviewing this application.')], ephemeral: true });
  }

  if (id.startsWith('confirm_restore_')) {
    const ticketId = parseInt(id.replace('confirm_restore_', ''), 10);
    const ticket = ticketService.getTicketById(ticketId);
    if (!ticket || ticket.guild_id !== interaction.guildId) throw new Error('Ticket not found.');
    if (!memberHasPermission(interaction.member, PERMISSIONS.RECOVER_ARCHIVED) && !hasDiscordAdmin(interaction.member)) {
      throw new Error('No permission.');
    }
    await interaction.deferUpdate();
    const restored = await ticketService.restoreArchivedTicket(ticket, interaction.member, interaction.guild);
    return interaction.followUp({
      embeds: [successEmbed('Restored', `Ticket #${String(restored.ticket_number).padStart(4, '0')} restored.`)],
      ephemeral: true
    });
  }

  if (id === 'cancel_restore' || id === 'cancel_action') {
    return interaction.update({ embeds: [infoEmbed('Cancelled', 'Action cancelled.')], components: [] });
  }

  if (id === 'confirm_config_reset') {
    if (!hasDiscordAdmin(interaction.member)) throw new Error('Admin only.');
    resetSettings(interaction.guildId);
    return interaction.update({ embeds: [successEmbed('Reset', 'Settings reset to defaults.')], components: [] });
  }

  if (id.startsWith('perm_toggle_')) {
    const withoutPrefix = id.replace('perm_toggle_', '');
    const firstUnderscore = withoutPrefix.indexOf('_');
    const roleId = withoutPrefix.slice(0, firstUnderscore);
    const permission = withoutPrefix.slice(firstUnderscore + 1);
    if (!hasDiscordAdmin(interaction.member)) throw new Error('Admin only.');
    const current = getRolePermissions(interaction.guildId, [roleId]);
    setRolePermission(interaction.guildId, roleId, permission, !current.has(permission));
    return showPermissionEditor(interaction, roleId, true);
  }

  if (id.startsWith('ticket_form_continue_')) {
    const panelId = parseInt(id.replace('ticket_form_continue_', ''), 10);
    const panel = panelService.getPanelById(panelId);
    if (!panel) throw new Error('Panel not found.');
    const key = `${interaction.user.id}_${panel.id}`;
    const state = pendingForms.get(key);
    if (!state) throw new Error('Form session expired. Click the panel button again.');
    return showQuestionModal(interaction, panel, state.questions, state.startIdx, state.previousAnswers);
  }

  if (id.startsWith('app_form_continue_')) {
    const appId = parseInt(id.replace('app_form_continue_', ''), 10);
    const app = applicationService.getApplicationById(appId);
    if (!app) throw new Error('Not found.');
    const key = `app_${interaction.user.id}_${app.id}`;
    const state = pendingForms.get(key);
    if (!state) throw new Error('Session expired.');
    return showAppQuestionModal(interaction, app, state.questions, state.startIdx, state.previousAnswers);
  }

  if (id.startsWith('panel_addq_')) {
    const panelId = parseInt(id.replace('panel_addq_', ''), 10);
    const modal = new ModalBuilder().setCustomId(`edit_panel_${panelId}_add_question`).setTitle('Add Question');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('value').setLabel('Question label').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45)
    ));
    return interaction.showModal(modal);
  }

  if (id.startsWith('panel_clearq_')) {
    const panelId = parseInt(id.replace('panel_clearq_', ''), 10);
    const qs = panelService.getQuestions(panelId);
    for (const q of qs) panelService.deleteQuestion(q.id);
    return interaction.reply({ embeds: [successEmbed('Cleared', 'All questions removed.')], ephemeral: true });
  }
}

async function showQuestionModal(interaction, panel, questions, startIdx, previousAnswers) {
  const batch = questions.slice(startIdx, startIdx + 5);
  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_${panel.id}_${startIdx}`)
    .setTitle(`Ticket Form (${startIdx + 1}-${startIdx + batch.length}/${questions.length})`);

  for (const q of batch) {
    const input = new TextInputBuilder()
      .setCustomId(`q_${q.id}`)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(!!q.required)
      .setMinLength(q.min_length || 0)
      .setMaxLength(Math.min(q.max_length || 1000, 1000));
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  pendingForms.set(`${interaction.user.id}_${panel.id}`, { previousAnswers, questions, startIdx });
  return interaction.showModal(modal);
}

async function showAppQuestionModal(interaction, app, questions, startIdx, previousAnswers) {
  const batch = questions.slice(startIdx, startIdx + 5);
  const modal = new ModalBuilder()
    .setCustomId(`app_form_${app.id}_${startIdx}`)
    .setTitle(`Application (${startIdx + 1}-${Math.min(startIdx + 5, questions.length)}/${questions.length})`);

  for (const q of batch) {
    const input = new TextInputBuilder()
      .setCustomId(`q_${q.id}`)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(!!q.required)
      .setMinLength(q.min_length || 0)
      .setMaxLength(Math.min(q.max_length || 1000, 1000));
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  pendingForms.set(`app_${interaction.user.id}_${app.id}`, { previousAnswers, questions, startIdx });
  return interaction.showModal(modal);
}

async function showPermissionEditor(interaction, roleId, update = false) {
  const current = getRolePermissions(interaction.guildId, [roleId]);
  const rows = [];
  const perms = Object.values(PERMISSIONS);
  for (let i = 0; i < perms.length; i += 5) {
    const slice = perms.slice(i, i + 5);
    const row = new ActionRowBuilder();
    for (const p of slice) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`perm_toggle_${roleId}_${p}`)
          .setLabel((PERMISSION_LABELS[p] || p).slice(0, 80))
          .setStyle(current.has(p) ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    }
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cp_main').setLabel('Main Menu').setStyle(ButtonStyle.Primary)
  ));
  const payload = {
    embeds: [infoEmbed('Permissions', `Configuring <@&${roleId}>\nGreen = enabled. Click to toggle.`)],
    components: rows,
    ephemeral: true
  };
  if (update) return interaction.update(payload);
  return interaction.reply(payload);
}

module.exports = {
  handleButton,
  handleCustomCommandRun,
  pendingForms,
  showQuestionModal,
  showAppQuestionModal,
  showPermissionEditor
};
