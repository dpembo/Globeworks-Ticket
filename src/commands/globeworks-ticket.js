const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { buildMainPanel } = require('../builders/controlPanel');
const ticketService = require('../services/ticketService');
const panelService = require('../services/panelService');
const applicationService = require('../services/applicationService');
const customCommandService = require('../services/customCommandService');
const { getSettings, updateSettings, resetSettings, ensureGuild } = require('../services/guildSettings');
const { generateTranscript } = require('../services/transcriptService');
const { memberHasPermission, hasDiscordAdmin, setRolePermission, getAllRolePermissions } = require('../utils/permissions');
const { PERMISSIONS, PERMISSION_LABELS, COLORS } = require('../config/constants');
const { successEmbed, errorEmbed, infoEmbed, ticketEmbed } = require('../utils/embeds');
const { logAction } = require('../services/loggingService');

const data = new SlashCommandBuilder()
  .setName('globeworks-ticket')
  .setDescription('GlobeWorks Ticket System — control panel and all ticket actions')
  .addSubcommand(sc => sc.setName('create').setDescription('Create a ticket (use panels for best experience)'))
  .addSubcommand(sc => sc.setName('close').setDescription('Close the current ticket')
    .addStringOption(o => o.setName('reason').setDescription('Close reason')))
  .addSubcommand(sc => sc.setName('reopen').setDescription('Reopen the current ticket'))
  .addSubcommand(sc => sc.setName('claim').setDescription('Claim the current ticket'))
  .addSubcommand(sc => sc.setName('unclaim').setDescription('Unclaim the current ticket'))
  .addSubcommand(sc => sc.setName('add').setDescription('Add a user to the ticket')
    .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
  .addSubcommand(sc => sc.setName('remove').setDescription('Remove a user from the ticket')
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
  .addSubcommand(sc => sc.setName('rename').setDescription('Rename the ticket channel')
    .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true)))
  .addSubcommand(sc => sc.setName('info').setDescription('Show ticket information'))
  .addSubcommand(sc => sc.setName('delete').setDescription('Permanently delete the ticket'))
  .addSubcommand(sc => sc.setName('transcript').setDescription('Generate a transcript of the ticket'))
  .addSubcommand(sc => sc.setName('archive').setDescription('Manually archive a closed ticket'))
  .addSubcommand(sc => sc.setName('archived').setDescription('Browse archived tickets'))
  .addSubcommand(sc => sc.setName('reopen-archived').setDescription('Restore an archived ticket')
    .addIntegerOption(o => o.setName('number').setDescription('Ticket number').setRequired(true)))
  // Panels
  .addSubcommandGroup(g => g.setName('panel').setDescription('Manage ticket panels')
    .addSubcommand(sc => sc.setName('create').setDescription('Create a ticket panel')
      .addStringOption(o => o.setName('name').setDescription('Panel name').setRequired(true)))
    .addSubcommand(sc => sc.setName('edit').setDescription('Edit a ticket panel')
      .addStringOption(o => o.setName('name').setDescription('Panel name').setRequired(true)))
    .addSubcommand(sc => sc.setName('delete').setDescription('Delete a ticket panel')
      .addStringOption(o => o.setName('name').setDescription('Panel name').setRequired(true)))
    .addSubcommand(sc => sc.setName('list').setDescription('List all panels'))
    .addSubcommand(sc => sc.setName('send').setDescription('Send a panel to a channel')
      .addStringOption(o => o.setName('name').setDescription('Panel name').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText))))
  // Applications
  .addSubcommandGroup(g => g.setName('application').setDescription('Manage applications')
    .addSubcommand(sc => sc.setName('create').setDescription('Create an application')
      .addStringOption(o => o.setName('name').setDescription('Application name').setRequired(true)))
    .addSubcommand(sc => sc.setName('edit').setDescription('Edit an application')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(sc => sc.setName('delete').setDescription('Delete an application')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(sc => sc.setName('list').setDescription('List applications'))
    .addSubcommand(sc => sc.setName('send').setDescription('Send application panel')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc => sc.setName('review').setDescription('Review pending applications'))
    .addSubcommand(sc => sc.setName('accept').setDescription('Accept an application')
      .addIntegerOption(o => o.setName('id').setDescription('Submission ID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(sc => sc.setName('deny').setDescription('Deny an application')
      .addIntegerOption(o => o.setName('id').setDescription('Submission ID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason'))))
  // Config
  .addSubcommand(sc => sc.setName('setup').setDescription('Interactive setup wizard'))
  .addSubcommandGroup(g => g.setName('config').setDescription('Configuration')
    .addSubcommand(sc => sc.setName('view').setDescription('View current configuration'))
    .addSubcommand(sc => sc.setName('reset').setDescription('Reset configuration to defaults')))
  .addSubcommand(sc => sc.setName('permissions').setDescription('Manage role permissions'))
  .addSubcommand(sc => sc.setName('logging').setDescription('Configure logging channels'))
  // Custom commands
  .addSubcommandGroup(g => g.setName('command').setDescription('Custom commands')
    .addSubcommand(sc => sc.setName('create').setDescription('Create a custom command')
      .addStringOption(o => o.setName('name').setDescription('Command name').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Description')))
    .addSubcommand(sc => sc.setName('edit').setDescription('Edit a custom command')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(sc => sc.setName('delete').setDescription('Delete a custom command')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(sc => sc.setName('list').setDescription('List custom commands'))
    .addSubcommand(sc => sc.setName('enable').setDescription('Enable a custom command')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true)))
    .addSubcommand(sc => sc.setName('disable').setDescription('Disable a custom command')
      .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);

  ensureGuild(interaction.guildId);

  // No subcommand → control panel
  if (!sub && !group) {
    const panel = buildMainPanel(interaction.member);
    return interaction.reply(panel);
  }

  try {
    if (group === 'panel') return handlePanel(interaction, sub);
    if (group === 'application') return handleApplication(interaction, sub);
    if (group === 'config') return handleConfig(interaction, sub);
    if (group === 'command') return handleCustomCommand(interaction, sub);

    switch (sub) {
      case 'create': return handleCreate(interaction);
      case 'close': return handleClose(interaction);
      case 'reopen': return handleReopen(interaction);
      case 'claim': return handleClaim(interaction);
      case 'unclaim': return handleUnclaim(interaction);
      case 'add': return handleAdd(interaction);
      case 'remove': return handleRemove(interaction);
      case 'rename': return handleRename(interaction);
      case 'info': return handleInfo(interaction);
      case 'delete': return handleDelete(interaction);
      case 'transcript': return handleTranscript(interaction);
      case 'archive': return handleArchive(interaction);
      case 'archived': return handleArchived(interaction);
      case 'reopen-archived': return handleReopenArchived(interaction);
      case 'setup': return handleSetup(interaction);
      case 'permissions': return handlePermissions(interaction);
      case 'logging': return handleLogging(interaction);
      default:
        return interaction.reply({ embeds: [errorEmbed('Unknown subcommand')], ephemeral: true });
    }
  } catch (err) {
    console.error('[Command Error]', err);
    const payload = { embeds: [errorEmbed('Error', err.message || 'An unexpected error occurred.')], ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload).catch(() => {});
    }
    return interaction.reply(payload).catch(() => {});
  }
}

async function requireTicket(interaction) {
  const ticket = ticketService.getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket) throw new Error('This command must be used inside a ticket channel.');
  return ticket;
}

async function handleCreate(interaction) {
  await interaction.reply({
    embeds: [infoEmbed('Create Ticket', 'Please use a ticket panel button to open a ticket. Panels support forms and proper configuration.\n\nUse `/globeworks-ticket panel list` and `/globeworks-ticket panel send` to set one up.')],
    ephemeral: true
  });
}

async function handleClose(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.CLOSE) && ticket.creator_id !== interaction.user.id) {
    throw new Error('You do not have permission to close this ticket.');
  }
  const reason = interaction.options.getString('reason') || 'No reason provided';
  await ticketService.closeTicket(ticket, interaction.member, interaction.guild, reason);
  await interaction.reply({ embeds: [successEmbed('Ticket Closed', `Ticket #${String(ticket.ticket_number).padStart(4, '0')} has been closed.`)], ephemeral: true });
}

async function handleReopen(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.REOPEN)) {
    throw new Error('You do not have permission to reopen tickets.');
  }
  await ticketService.reopenTicket(ticket, interaction.member, interaction.guild);
  await interaction.reply({ embeds: [successEmbed('Ticket Reopened', `Ticket #${String(ticket.ticket_number).padStart(4, '0')} has been reopened.`)] });
}

async function handleClaim(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.CLAIM)) {
    throw new Error('You do not have permission to claim tickets.');
  }
  await ticketService.claimTicket(ticket, interaction.member, interaction.guild);
  await interaction.reply({ embeds: [successEmbed('Claimed', `You claimed ticket #${String(ticket.ticket_number).padStart(4, '0')}.`)] });
}

async function handleUnclaim(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.UNCLAIM) && ticket.claimant_id !== interaction.user.id) {
    throw new Error('You do not have permission to unclaim this ticket.');
  }
  await ticketService.unclaimTicket(ticket, interaction.member, interaction.guild);
  await interaction.reply({ embeds: [successEmbed('Unclaimed', `Ticket #${String(ticket.ticket_number).padStart(4, '0')} is no longer claimed.`)] });
}

async function handleAdd(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.ADD_USERS)) {
    throw new Error('You do not have permission to add users.');
  }
  const user = interaction.options.getUser('user');
  await ticketService.addUserToTicket(ticket, user.id, interaction.member, interaction.guild);
  await interaction.reply({ embeds: [successEmbed('User Added', `${user} has been added to the ticket.`)] });
}

async function handleRemove(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.REMOVE_USERS)) {
    throw new Error('You do not have permission to remove users.');
  }
  const user = interaction.options.getUser('user');
  await ticketService.removeUserFromTicket(ticket, user.id, interaction.member, interaction.guild);
  await interaction.reply({ embeds: [successEmbed('User Removed', `${user} has been removed from the ticket.`)] });
}

async function handleRename(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.RENAME)) {
    throw new Error('You do not have permission to rename tickets.');
  }
  const name = interaction.options.getString('name');
  await ticketService.renameTicket(ticket, name, interaction.guild);
  await interaction.reply({ embeds: [successEmbed('Renamed', `Ticket renamed to \`${name}\`.`)] });
}

async function handleInfo(interaction) {
  const ticket = await requireTicket(interaction);
  const panel = ticket.panel_id ? ticketService.getPanel(ticket.panel_id) : null;
  const responses = ticketService.getFormResponses(ticket.id);
  const embed = ticketEmbed(ticket, panel, responses);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleDelete(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.DELETE)) {
    throw new Error('You do not have permission to delete tickets.');
  }
  await interaction.reply({ embeds: [successEmbed('Deleting', 'Ticket channel will be deleted.')], ephemeral: true });
  await ticketService.deleteTicket(ticket, interaction.member, interaction.guild);
}

async function handleTranscript(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.VIEW_TRANSCRIPTS)) {
    throw new Error('You do not have permission to generate transcripts.');
  }
  const settings = getSettings(interaction.guildId);
  if (!settings.transcript_channel_id) {
    throw new Error('Transcript channel is not configured. Use `/globeworks-ticket config` or the control panel.');
  }
  await interaction.deferReply({ ephemeral: true });
  await generateTranscript(interaction.guild, ticket, settings.transcript_channel_id);
  await interaction.editReply({ embeds: [successEmbed('Transcript Generated', 'Transcript has been sent to the configured channel.')] });
}

async function handleArchive(interaction) {
  const ticket = await requireTicket(interaction);
  if (!memberHasPermission(interaction.member, PERMISSIONS.CLOSE)) {
    throw new Error('You do not have permission to archive tickets.');
  }
  if (ticket.status === 'open') {
    await ticketService.closeTicket(ticket, interaction.member, interaction.guild, 'Manually archived');
  } else {
    const settings = getSettings(interaction.guildId);
    await ticketService.archiveToForum(interaction.guild, ticket, settings);
  }
  await interaction.reply({ embeds: [successEmbed('Archived', 'Ticket has been archived.')], ephemeral: true });
}

async function handleArchived(interaction) {
  if (!memberHasPermission(interaction.member, PERMISSIONS.RECOVER_ARCHIVED) && !hasDiscordAdmin(interaction.member)) {
    throw new Error('You do not have permission to browse archives.');
  }
  const tickets = ticketService.listArchived(interaction.guildId, { limit: 15 });
  if (!tickets.length) {
    return interaction.reply({ embeds: [infoEmbed('Archives', 'No archived tickets found.')], ephemeral: true });
  }
  const lines = tickets.map(t =>
    `\`#${String(t.ticket_number).padStart(4, '0')}\` — ${t.ticket_type || 'General'} — <@${t.creator_id}> — ${t.status} — expires ${t.recovery_expires_at ? `<t:${Math.floor(new Date(t.recovery_expires_at).getTime() / 1000)}:R>` : 'N/A'}`
  );
  await interaction.reply({
    embeds: [infoEmbed('📦 Archived Tickets', lines.join('\n')).setFooter({ text: 'Use /globeworks-ticket reopen-archived number:<num> to restore' })],
    ephemeral: true
  });
}

async function handleReopenArchived(interaction) {
  if (!memberHasPermission(interaction.member, PERMISSIONS.RECOVER_ARCHIVED) && !hasDiscordAdmin(interaction.member)) {
    throw new Error('You do not have permission to restore archived tickets.');
  }
  const settings = getSettings(interaction.guildId);
  if (settings.recovery_channel_id && interaction.channelId !== settings.recovery_channel_id) {
    throw new Error('This command can only be used in the configured recovery channel.');
  }
  const number = interaction.options.getInteger('number');
  const ticket = ticketService.getTicketByNumber(interaction.guildId, number);
  if (!ticket) throw new Error('Ticket not found.');
  if (ticket.status === 'permanent') throw new Error('This ticket is permanently archived and cannot be restored.');
  if (ticket.status === 'open') throw new Error('This ticket is already open.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm_restore_${ticket.id}`).setLabel('Reopen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cancel_restore').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  await interaction.reply({
    embeds: [infoEmbed('Confirm Restore', `Restore ticket **#${String(ticket.ticket_number).padStart(4, '0')}**?\nCreator: <@${ticket.creator_id}>\nStatus: ${ticket.status}`)],
    components: [row],
    ephemeral: true
  });
}

async function handleSetup(interaction) {
  if (!hasDiscordAdmin(interaction.member)) {
    throw new Error('Administrator permission required.');
  }
  await interaction.reply({
    embeds: [infoEmbed('🛠️ Setup', 'Use the control panel (`/globeworks-ticket`) → **Configuration** to set:\n• Ticket category\n• Support role\n• Archive forum channel\n• Recovery channel\n• Transcript channel\n• Log channels\n\nThen create panels with `/globeworks-ticket panel create`.')],
    ephemeral: true
  });
}

async function handleConfig(interaction, sub) {
  if (!hasDiscordAdmin(interaction.member) && !memberHasPermission(interaction.member, PERMISSIONS.MANAGE_SETTINGS)) {
    throw new Error('You do not have permission to manage configuration.');
  }
  if (sub === 'view') {
    const s = getSettings(interaction.guildId);
    const embed = infoEmbed('⚙️ Current Configuration', null)
      .addFields(
        { name: 'Ticket Counter', value: String(s.ticket_counter), inline: true },
        { name: 'Recovery Days', value: String(s.recovery_days), inline: true },
        { name: 'Auto Transcript', value: s.auto_transcript ? 'Yes' : 'No', inline: true },
        { name: 'Ticket Category', value: s.ticket_category_id ? `<#${s.ticket_category_id}>` : 'Not set', inline: true },
        { name: 'Support Role', value: s.support_role_id ? `<@&${s.support_role_id}>` : 'Not set', inline: true },
        { name: 'Transcript Channel', value: s.transcript_channel_id ? `<#${s.transcript_channel_id}>` : 'Not set', inline: true },
        { name: 'Archive Forum', value: s.archive_forum_id ? `<#${s.archive_forum_id}>` : 'Not set', inline: true },
        { name: 'Recovery Channel', value: s.recovery_channel_id ? `<#${s.recovery_channel_id}>` : 'Not set', inline: true }
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  if (sub === 'reset') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_config_reset').setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_action').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({
      embeds: [infoEmbed('⚠️ Reset Configuration', 'This will reset all guild settings to defaults. Panels, tickets and permissions are not deleted.')],
      components: [row],
      ephemeral: true
    });
  }
}

async function handlePermissions(interaction) {
  if (!hasDiscordAdmin(interaction.member)) {
    throw new Error('Administrator permission required.');
  }
  const row = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('perm_role_select')
      .setPlaceholder('Select a role to configure permissions')
      .setMinValues(1)
      .setMaxValues(1)
  );
  await interaction.reply({
    embeds: [infoEmbed('🔐 Permissions', 'Select a role to view and toggle its ticket permissions.')],
    components: [row],
    ephemeral: true
  });
}

async function handleLogging(interaction) {
  if (!hasDiscordAdmin(interaction.member) && !memberHasPermission(interaction.member, PERMISSIONS.MANAGE_SETTINGS)) {
    throw new Error('You do not have permission to manage logging.');
  }
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('log_channel_type')
      .setPlaceholder('Select log type')
      .addOptions(
        { label: 'Ticket Creation', value: 'log_ticket_create' },
        { label: 'Ticket Closure', value: 'log_ticket_close' },
        { label: 'Ticket Deletion', value: 'log_ticket_delete' },
        { label: 'Claim / Unclaim', value: 'log_claim' },
        { label: 'Reopen', value: 'log_reopen' },
        { label: 'User Changes', value: 'log_user_change' },
        { label: 'Applications', value: 'log_application' },
        { label: 'Permissions', value: 'log_permission' },
        { label: 'Configuration', value: 'log_config' },
        { label: 'Archive', value: 'log_archive' },
        { label: 'Restore', value: 'log_restore' },
        { label: 'Expiration', value: 'log_expire' },
        { label: 'Custom Commands', value: 'log_custom_command' }
      )
  );
  await interaction.reply({
    embeds: [infoEmbed('📜 Logging', 'Select a log type, then choose a channel.')],
    components: [row],
    ephemeral: true
  });
}

async function handlePanel(interaction, sub) {
  if (!memberHasPermission(interaction.member, PERMISSIONS.MANAGE_PANELS) && !hasDiscordAdmin(interaction.member)) {
    throw new Error('You do not have permission to manage panels.');
  }

  if (sub === 'create') {
    const name = interaction.options.getString('name');
    if (panelService.getPanelByName(interaction.guildId, name)) {
      throw new Error('A panel with that name already exists.');
    }
    const panel = panelService.createPanel(interaction.guildId, { name });
    await interaction.reply({
      embeds: [successEmbed('Panel Created', `Panel **${name}** created (ID: ${panel.id}).\n\nUse the control panel or \`/globeworks-ticket panel edit\` to configure questions, embed, button, category, and staff role.\nThen \`/globeworks-ticket panel send\` to post it.`)],
      ephemeral: true
    });
  } else if (sub === 'list') {
    const panels = panelService.listPanels(interaction.guildId);
    if (!panels.length) {
      return interaction.reply({ embeds: [infoEmbed('Panels', 'No panels configured.')], ephemeral: true });
    }
    const lines = panels.map(p => `**${p.name}** (ID: ${p.id}) — ${p.enabled ? '✅' : '❌'} — ${p.use_thread ? 'Thread' : 'Channel'} — max ${p.max_open_per_user}/user`);
    await interaction.reply({ embeds: [infoEmbed('🎟️ Panels', lines.join('\n'))], ephemeral: true });
  } else if (sub === 'delete') {
    const name = interaction.options.getString('name');
    const panel = panelService.getPanelByName(interaction.guildId, name);
    if (!panel) throw new Error('Panel not found.');
    panelService.deletePanel(panel.id);
    await interaction.reply({ embeds: [successEmbed('Deleted', `Panel **${name}** deleted.`)], ephemeral: true });
  } else if (sub === 'send') {
    const name = interaction.options.getString('name');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const panel = panelService.getPanelByName(interaction.guildId, name);
    if (!panel) throw new Error('Panel not found.');
    await panelService.sendPanel(interaction.guild, channel, panel);
    await interaction.reply({ embeds: [successEmbed('Sent', `Panel **${name}** sent to ${channel}.`)], ephemeral: true });
  } else if (sub === 'edit') {
    const name = interaction.options.getString('name');
    const panel = panelService.getPanelByName(interaction.guildId, name);
    if (!panel) throw new Error('Panel not found.');
    // Open interactive edit via select
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`panel_edit_${panel.id}`)
        .setPlaceholder('What do you want to edit?')
        .addOptions(
          { label: 'Embed Title / Description', value: 'embed' },
          { label: 'Button Label / Emoji / Style', value: 'button' },
          { label: 'Category', value: 'category' },
          { label: 'Staff Role', value: 'staff' },
          { label: 'Naming Format', value: 'naming' },
          { label: 'Max Open Tickets', value: 'max' },
          { label: 'Use Threads', value: 'thread' },
          { label: 'Manage Questions', value: 'questions' },
          { label: 'Toggle Enabled', value: 'toggle' }
        )
    );
    await interaction.reply({
      embeds: [infoEmbed(`Edit Panel: ${panel.name}`, 'Select a property to edit.')],
      components: [row],
      ephemeral: true
    });
  }
}

async function handleApplication(interaction, sub) {
  if (['create', 'edit', 'delete', 'list', 'send'].includes(sub)) {
    if (!memberHasPermission(interaction.member, PERMISSIONS.MANAGE_APPLICATIONS) && !hasDiscordAdmin(interaction.member)) {
      throw new Error('You do not have permission to manage applications.');
    }
  }

  if (sub === 'create') {
    const name = interaction.options.getString('name');
    const app = applicationService.createApplication(interaction.guildId, { name });
    await interaction.reply({
      embeds: [successEmbed('Application Created', `**${name}** created (ID: ${app.id}). Configure questions and send it via the control panel or commands.`)],
      ephemeral: true
    });
  } else if (sub === 'list') {
    const apps = applicationService.listApplications(interaction.guildId);
    if (!apps.length) return interaction.reply({ embeds: [infoEmbed('Applications', 'None configured.')], ephemeral: true });
    const lines = apps.map(a => `**${a.name}** (ID: ${a.id}) — ${a.enabled ? '✅' : '❌'}`);
    await interaction.reply({ embeds: [infoEmbed('📋 Applications', lines.join('\n'))], ephemeral: true });
  } else if (sub === 'delete') {
    const name = interaction.options.getString('name');
    const apps = applicationService.listApplications(interaction.guildId);
    const app = apps.find(a => a.name === name);
    if (!app) throw new Error('Application not found.');
    applicationService.deleteApplication(app.id);
    await interaction.reply({ embeds: [successEmbed('Deleted', `Application **${name}** deleted.`)], ephemeral: true });
  } else if (sub === 'send') {
    const name = interaction.options.getString('name');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const apps = applicationService.listApplications(interaction.guildId);
    const app = apps.find(a => a.name === name);
    if (!app) throw new Error('Application not found.');
    await applicationService.sendApplication(interaction.guild, channel, app);
    await interaction.reply({ embeds: [successEmbed('Sent', `Application **${name}** sent to ${channel}.`)], ephemeral: true });
  } else if (sub === 'accept' || sub === 'deny') {
    const id = interaction.options.getInteger('id');
    const reason = interaction.options.getString('reason') || '';
    const submission = applicationService.getSubmission(id);
    if (!submission || submission.guild_id !== interaction.guildId) throw new Error('Submission not found.');
    const perm = sub === 'accept' ? PERMISSIONS.ACCEPT_APPLICATIONS : PERMISSIONS.DENY_APPLICATIONS;
    if (!memberHasPermission(interaction.member, perm) && !hasDiscordAdmin(interaction.member)) {
      throw new Error('You do not have permission for this action.');
    }
    await applicationService.decideApplication(submission, interaction.member, interaction.guild, sub === 'accept' ? 'accepted' : 'denied', reason);
    await interaction.reply({ embeds: [successEmbed(sub === 'accept' ? 'Accepted' : 'Denied', `Application #${id} has been ${sub}ed.`)], ephemeral: true });
  } else if (sub === 'review') {
    await interaction.reply({ embeds: [infoEmbed('Review', 'Open the application channel and use the Accept / Deny buttons on the submission message.')], ephemeral: true });
  } else if (sub === 'edit') {
    await interaction.reply({ embeds: [infoEmbed('Edit', 'Use the control panel Applications section or recreate with desired settings. Full modal editors are available via panel buttons.')], ephemeral: true });
  }
}

async function handleCustomCommand(interaction, sub) {
  if (!memberHasPermission(interaction.member, PERMISSIONS.MANAGE_CUSTOM_COMMANDS) && !hasDiscordAdmin(interaction.member)) {
    throw new Error('You do not have permission to manage custom commands.');
  }

  if (sub === 'create') {
    const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (!name) throw new Error('Invalid command name.');
    if (customCommandService.getCommandByName(interaction.guildId, name)) {
      throw new Error('A custom command with that name already exists.');
    }
    const description = interaction.options.getString('description') || 'Custom command';
    const cmd = customCommandService.createCommand(interaction.guildId, {
      name,
      description,
      creator_id: interaction.user.id,
      embed_title: name,
      embed_description: 'Edit this command to customize the response.'
    });
    // Open modal-like edit flow via select
    await interaction.reply({
      embeds: [successEmbed('Custom Command Created', `\`/globeworks-ticket ${name}\` created.\nUse edit to set embed content, fields, and buttons.\nCommands are registered dynamically on next ready cycle or restart.`)],
      ephemeral: true
    });
    // Trigger re-register
    interaction.client.emit('customCommandsChanged', interaction.guildId);
  } else if (sub === 'list') {
    const cmds = customCommandService.listCommands(interaction.guildId);
    if (!cmds.length) return interaction.reply({ embeds: [infoEmbed('Custom Commands', 'None configured.')], ephemeral: true });
    const lines = cmds.map(c => `**${c.name}** — ${c.enabled ? '✅' : '❌'} — ${c.description || ''}`);
    await interaction.reply({ embeds: [infoEmbed('🛠️ Custom Commands', lines.join('\n'))], ephemeral: true });
  } else if (sub === 'delete') {
    const name = interaction.options.getString('name');
    const cmd = customCommandService.getCommandByName(interaction.guildId, name);
    if (!cmd) throw new Error('Command not found.');
    customCommandService.deleteCommand(cmd.id);
    interaction.client.emit('customCommandsChanged', interaction.guildId);
    await interaction.reply({ embeds: [successEmbed('Deleted', `Command **${name}** deleted.`)], ephemeral: true });
  } else if (sub === 'enable' || sub === 'disable') {
    const name = interaction.options.getString('name');
    const cmd = customCommandService.getCommandByName(interaction.guildId, name);
    if (!cmd) throw new Error('Command not found.');
    customCommandService.updateCommand(cmd.id, { enabled: sub === 'enable' ? 1 : 0 });
    interaction.client.emit('customCommandsChanged', interaction.guildId);
    await interaction.reply({ embeds: [successEmbed(sub === 'enable' ? 'Enabled' : 'Disabled', `Command **${name}** is now ${sub}d.`)], ephemeral: true });
  } else if (sub === 'edit') {
    const name = interaction.options.getString('name');
    const cmd = customCommandService.getCommandByName(interaction.guildId, name);
    if (!cmd) throw new Error('Command not found.');
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`cmd_edit_${cmd.id}`)
        .setPlaceholder('What to edit?')
        .addOptions(
          { label: 'Title', value: 'title' },
          { label: 'Description', value: 'description' },
          { label: 'Footer', value: 'footer' },
          { label: 'Color', value: 'color' },
          { label: 'Add Field', value: 'add_field' },
          { label: 'Add Link Button', value: 'add_button' },
          { label: 'Toggle Ephemeral', value: 'ephemeral' },
          { label: 'Preview', value: 'preview' }
        )
    );
    await interaction.reply({
      embeds: [infoEmbed(`Edit: ${cmd.name}`, 'Select a property to edit.')],
      components: [row],
      ephemeral: true
    });
  }
}

module.exports = { data, execute };
