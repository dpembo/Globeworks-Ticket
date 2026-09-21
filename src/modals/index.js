const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const ticketService = require('../services/ticketService');
const panelService = require('../services/panelService');
const applicationService = require('../services/applicationService');
const customCommandService = require('../services/customCommandService');
const { updateSettings } = require('../services/guildSettings');
const { successEmbed, errorEmbed, infoEmbed } = require('../utils/embeds');
const { pendingForms } = require('../components/buttons/index');

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id === 'quick_panel_create') {
    const name = interaction.fields.getTextInputValue('name');
    if (panelService.getPanelByName(interaction.guildId, name)) {
      return interaction.reply({ embeds: [errorEmbed('Exists', 'A panel with that name already exists.')], ephemeral: true });
    }
    const panel = panelService.createPanel(interaction.guildId, { name });
    return interaction.reply({
      embeds: [successEmbed('Created', `Panel **${name}** (ID ${panel.id}) created. Edit with \`/globeworks-ticket panel edit name:${name}\`.`)],
      ephemeral: true
    });
  }

  if (id.startsWith('ticket_form_')) {
    const parts = id.replace('ticket_form_', '').split('_');
    const panelId = parseInt(parts[0], 10);
    const startIdx = parseInt(parts[1], 10);
    const panel = panelService.getPanelById(panelId);
    if (!panel || panel.guild_id !== interaction.guildId) throw new Error('Panel not found.');

    const questions = panelService.getQuestions(panel.id);
    const key = `${interaction.user.id}_${panel.id}`;
    const state = pendingForms.get(key) || { previousAnswers: [], questions, startIdx };
    const batch = questions.slice(startIdx, startIdx + 5);

    const newAnswers = [...state.previousAnswers];
    for (const q of batch) {
      const val = interaction.fields.getTextInputValue(`q_${q.id}`);
      newAnswers.push({ question_id: q.id, question_text: q.label, answer: val });
    }

    const nextIdx = startIdx + 5;
    if (nextIdx < questions.length) {
      pendingForms.set(key, { previousAnswers: newAnswers, questions, startIdx: nextIdx });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_form_continue_${panelId}`).setLabel('Continue Form').setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({
        embeds: [infoEmbed('Continue', `Remaining questions: ${questions.length - nextIdx}`)],
        components: [row],
        ephemeral: true
      });
    }

    pendingForms.delete(key);
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await ticketService.createTicket(interaction.guild, interaction.member, panel, newAnswers);
      const target = result.channel || result.thread;
      return interaction.editReply({ embeds: [successEmbed('Ticket Created', `Your ticket: ${target}`)] });
    } catch (err) {
      console.error('Ticket create failed, answers:', newAnswers);
      return interaction.editReply({
        embeds: [errorEmbed('Creation Failed', `${err.message}\n\nYour form answers were logged. Contact staff if needed.`)]
      });
    }
  }

  if (id.startsWith('app_form_')) {
    const parts = id.replace('app_form_', '').split('_');
    const appId = parseInt(parts[0], 10);
    const startIdx = parseInt(parts[1], 10);
    const app = applicationService.getApplicationById(appId);
    if (!app || app.guild_id !== interaction.guildId) throw new Error('Application not found.');

    const questions = applicationService.getAppQuestions(app.id);
    const key = `app_${interaction.user.id}_${app.id}`;
    const state = pendingForms.get(key) || { previousAnswers: [], questions, startIdx };
    const batch = questions.slice(startIdx, startIdx + 5);

    const newAnswers = [...state.previousAnswers];
    for (const q of batch) {
      const val = interaction.fields.getTextInputValue(`q_${q.id}`);
      newAnswers.push({ question_id: q.id, question_text: q.label, answer: val });
    }

    const nextIdx = startIdx + 5;
    if (nextIdx < questions.length) {
      pendingForms.set(key, { previousAnswers: newAnswers, questions, startIdx: nextIdx });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_form_continue_${appId}`).setLabel('Continue Application').setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({
        embeds: [infoEmbed('Continue', `Remaining: ${questions.length - nextIdx}`)],
        components: [row],
        ephemeral: true
      });
    }

    pendingForms.delete(key);
    await interaction.deferReply({ ephemeral: true });
    const result = await applicationService.submitApplication(interaction.guild, interaction.member, app, newAnswers);
    return interaction.editReply({
      embeds: [successEmbed('Submitted', `Application channel: ${result.channel}`)]
    });
  }

  if (id.startsWith('close_modal_')) {
    const ticketId = parseInt(id.replace('close_modal_', ''), 10);
    const ticket = ticketService.getTicketById(ticketId);
    if (!ticket || ticket.guild_id !== interaction.guildId) throw new Error('Ticket not found.');
    const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided';
    await ticketService.closeTicket(ticket, interaction.member, interaction.guild, reason);
    return interaction.reply({ embeds: [successEmbed('Closed', `Ticket #${String(ticket.ticket_number).padStart(4, '0')} closed.`)] });
  }

  if (id.startsWith('app_decide_')) {
    const parts = id.replace('app_decide_', '').split('_');
    const status = parts[0];
    const subId = parseInt(parts[1], 10);
    const submission = applicationService.getSubmission(subId);
    if (!submission || submission.guild_id !== interaction.guildId) throw new Error('Not found.');
    const reason = interaction.fields.getTextInputValue('reason') || '';
    await applicationService.decideApplication(
      submission, interaction.member, interaction.guild,
      status === 'accept' ? 'accepted' : 'denied', reason
    );
    return interaction.reply({
      embeds: [successEmbed(status === 'accept' ? 'Accepted' : 'Denied', `Application #${subId} updated.`)],
      ephemeral: true
    });
  }

  if (id === 'archive_search_modal') {
    const query = interaction.fields.getTextInputValue('query');
    const tickets = ticketService.listArchived(interaction.guildId, { search: query, limit: 20 });
    const text = tickets.length
      ? tickets.map(t => `\`#${String(t.ticket_number).padStart(4, '0')}\` <@${t.creator_id}> ${t.status}`).join('\n')
      : 'No results.';
    return interaction.reply({ embeds: [infoEmbed('Search Results', text)], ephemeral: true });
  }

  if (id.startsWith('edit_panel_')) {
    const match = id.match(/^edit_panel_(\d+)_(.+)$/);
    if (!match) return;
    const panelId = parseInt(match[1], 10);
    const fieldName = match[2];
    const panel = panelService.getPanelById(panelId);
    if (!panel || panel.guild_id !== interaction.guildId) throw new Error('Panel not found.');

    const value = interaction.fields.getTextInputValue('value');
    if (fieldName === 'add_question') {
      panelService.addQuestion(panelId, interaction.guildId, { label: value, required: true });
      return interaction.reply({ embeds: [successEmbed('Question Added', value)], ephemeral: true });
    }
    const updates = {};
    if (fieldName === 'embed_title') updates.embed_title = value;
    else if (fieldName === 'embed_description') updates.embed_description = value;
    else if (fieldName === 'button_label') updates.button_label = value;
    else if (fieldName === 'button_emoji') updates.button_emoji = value || null;
    else if (fieldName === 'naming') updates.naming_format = value;
    else if (fieldName === 'max') updates.max_open_per_user = parseInt(value, 10) || 1;
    panelService.updatePanel(panelId, updates);
    return interaction.reply({ embeds: [successEmbed('Updated', `Panel **${panel.name}** updated.`)], ephemeral: true });
  }

  if (id.startsWith('edit_cmd_')) {
    const match = id.match(/^edit_cmd_(\d+)_(.+)$/);
    if (!match) return;
    const cmdId = parseInt(match[1], 10);
    const field = match[2];
    const cmd = customCommandService.getCommandById(cmdId);
    if (!cmd || cmd.guild_id !== interaction.guildId) throw new Error('Command not found.');
    const value = interaction.fields.getTextInputValue('value');
    if (field === 'title') customCommandService.updateCommand(cmdId, { embed_title: value });
    else if (field === 'description') customCommandService.updateCommand(cmdId, { embed_description: value });
    else if (field === 'footer') customCommandService.updateCommand(cmdId, { embed_footer: value });
    else if (field === 'color') customCommandService.updateCommand(cmdId, { embed_color: value.startsWith('#') ? value : `#${value}` });
    else if (field === 'add_field') {
      const [name, ...rest] = value.split('|');
      customCommandService.addField(cmdId, interaction.guildId, (name || 'Field').trim(), rest.join('|').trim() || 'Value');
    } else if (field === 'add_button') {
      const [label, url] = value.split('|');
      if (label && url) customCommandService.addButton(cmdId, interaction.guildId, label.trim(), url.trim());
    }
    return interaction.reply({ embeds: [successEmbed('Updated', `Command **${cmd.name}** updated.`)], ephemeral: true });
  }

  if (id.startsWith('config_set_')) {
    const field = id.replace('config_set_', '');
    const value = interaction.fields.getTextInputValue('value');
    if (field === 'recovery_days') {
      const days = parseInt(value, 10);
      if (isNaN(days) || days < 1 || days > 365) throw new Error('Enter a number between 1 and 365.');
      updateSettings(interaction.guildId, { recovery_days: days });
      return interaction.reply({ embeds: [successEmbed('Updated', `Recovery period: ${days} days.`)], ephemeral: true });
    }
  }
}

module.exports = { handleModal };
