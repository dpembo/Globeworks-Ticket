const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType
} = require('discord.js');
const panelService = require('../../services/panelService');
const customCommandService = require('../../services/customCommandService');
const { getSettings, updateSettings } = require('../../services/guildSettings');
const { hasDiscordAdmin } = require('../../utils/permissions');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { showPermissionEditor } = require('../buttons/index');

async function handleSelect(interaction) {
  const id = interaction.customId;
  const value = interaction.values[0];

  if (id === 'cp_ticket_action') {
    return interaction.reply({
      embeds: [infoEmbed('Ticket Action', `Run \`/globeworks-ticket ${value}\` inside the ticket channel, or use the ticket buttons.`)],
      ephemeral: true
    });
  }

  if (id === 'cp_panel_action') {
    if (value === 'list') {
      const panels = panelService.listPanels(interaction.guildId);
      const text = panels.length ? panels.map(p => `**${p.name}** (ID ${p.id})`).join('\n') : 'No panels.';
      return interaction.reply({ embeds: [infoEmbed('Panels', text)], ephemeral: true });
    }
    if (value === 'create') {
      const modal = new ModalBuilder().setCustomId('quick_panel_create').setTitle('Create Panel');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Panel name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
      ));
      return interaction.showModal(modal);
    }
    return interaction.reply({
      embeds: [infoEmbed('Panels', `Use \`/globeworks-ticket panel ${value}\`.`)],
      ephemeral: true
    });
  }

  if (id === 'cp_app_action') {
    return interaction.reply({
      embeds: [infoEmbed('Applications', `Use \`/globeworks-ticket application ${value}\`.`)],
      ephemeral: true
    });
  }

  if (id === 'cp_cmd_action') {
    return interaction.reply({
      embeds: [infoEmbed('Custom Commands', `Use \`/globeworks-ticket command ${value}\`.`)],
      ephemeral: true
    });
  }

  if (id === 'cp_config_section') {
    if (value === 'view') {
      const s = getSettings(interaction.guildId);
      const embed = infoEmbed('Configuration', null).addFields(
        { name: 'Recovery Days', value: String(s.recovery_days), inline: true },
        { name: 'Category', value: s.ticket_category_id ? `<#${s.ticket_category_id}>` : '—', inline: true },
        { name: 'Support Role', value: s.support_role_id ? `<@&${s.support_role_id}>` : '—', inline: true },
        { name: 'Transcript', value: s.transcript_channel_id ? `<#${s.transcript_channel_id}>` : '—', inline: true },
        { name: 'Archive Forum', value: s.archive_forum_id ? `<#${s.archive_forum_id}>` : '—', inline: true },
        { name: 'Recovery Channel', value: s.recovery_channel_id ? `<#${s.recovery_channel_id}>` : '—', inline: true }
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (value === 'days') {
      const modal = new ModalBuilder().setCustomId('config_set_recovery_days').setTitle('Recovery Period');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('Days (1-365)').setStyle(TextInputStyle.Short).setRequired(true)
          .setValue(String(getSettings(interaction.guildId).recovery_days))
      ));
      return interaction.showModal(modal);
    }
    if (value === 'reset') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_config_reset').setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_action').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ embeds: [infoEmbed('Reset?', 'Reset all guild settings to defaults?')], components: [row], ephemeral: true });
    }
    if (['category', 'transcript', 'forum', 'recovery'].includes(value)) {
      const typeMap = {
        category: [ChannelType.GuildCategory],
        transcript: [ChannelType.GuildText],
        forum: [ChannelType.GuildForum],
        recovery: [ChannelType.GuildText]
      };
      const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`config_channel_${value}`)
          .setPlaceholder('Select channel')
          .addChannelTypes(...typeMap[value])
          .setMinValues(1).setMaxValues(1)
      );
      return interaction.reply({ embeds: [infoEmbed('Select Channel', `Choose the ${value} channel.`)], components: [row], ephemeral: true });
    }
    if (value === 'role') {
      const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('config_role_support').setPlaceholder('Select support role').setMinValues(1).setMaxValues(1)
      );
      return interaction.reply({ embeds: [infoEmbed('Support Role', 'Select the default staff role.')], components: [row], ephemeral: true });
    }
  }

  if (id === 'cp_log_type' || id === 'log_channel_type') {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`set_log_${value}`)
        .setPlaceholder('Select log channel')
        .addChannelTypes(ChannelType.GuildText)
        .setMinValues(1).setMaxValues(1)
    );
    return interaction.reply({
      embeds: [infoEmbed('Logging', `Select channel for **${value}** logs.`)],
      components: [row],
      ephemeral: true
    });
  }

  if (id.startsWith('panel_edit_')) {
    const panelId = parseInt(id.replace('panel_edit_', ''), 10);
    const panel = panelService.getPanelById(panelId);
    if (!panel) throw new Error('Panel not found.');

    if (value === 'questions') {
      const questions = panelService.getQuestions(panelId);
      const text = questions.length
        ? questions.map((q, i) => `${i + 1}. ${q.label} (${q.style})`).join('\n')
        : 'No questions yet.';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`panel_addq_${panelId}`).setLabel('Add Question').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`panel_clearq_${panelId}`).setLabel('Clear All').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ embeds: [infoEmbed('Questions', text)], components: [row], ephemeral: true });
    }
    if (value === 'toggle') {
      panelService.updatePanel(panelId, { enabled: panel.enabled ? 0 : 1 });
      return interaction.reply({ embeds: [successEmbed('Toggled', `Panel is now ${panel.enabled ? 'disabled' : 'enabled'}.`)], ephemeral: true });
    }
    if (value === 'thread') {
      panelService.updatePanel(panelId, { use_thread: panel.use_thread ? 0 : 1 });
      return interaction.reply({ embeds: [successEmbed('Updated', `Use threads: ${!panel.use_thread}`)], ephemeral: true });
    }
    if (value === 'category') {
      const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(`panel_cat_${panelId}`).setPlaceholder('Select category').addChannelTypes(ChannelType.GuildCategory)
      );
      return interaction.reply({ embeds: [infoEmbed('Category', 'Select category for tickets.')], components: [row], ephemeral: true });
    }
    if (value === 'staff') {
      const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(`panel_staff_${panelId}`).setPlaceholder('Select staff role')
      );
      return interaction.reply({ embeds: [infoEmbed('Staff Role', 'Select staff role.')], components: [row], ephemeral: true });
    }

    const fieldMap = { embed: 'embed_title', button: 'button_label', naming: 'naming', max: 'max' };
    const field = fieldMap[value] || value;
    const modal = new ModalBuilder().setCustomId(`edit_panel_${panelId}_${field}`).setTitle('Edit Panel');
    let label = 'Value';
    let def = '';
    if (field === 'embed_title') { label = 'Embed Title'; def = panel.embed_title || ''; }
    if (field === 'button_label') { label = 'Button Label'; def = panel.button_label || ''; }
    if (field === 'naming') { label = 'Naming ({number}, {user})'; def = panel.naming_format || 'ticket-{number}'; }
    if (field === 'max') { label = 'Max open per user'; def = String(panel.max_open_per_user); }
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(def.slice(0, 100))
    ));
    return interaction.showModal(modal);
  }

  if (id.startsWith('cmd_edit_')) {
    const cmdId = parseInt(id.replace('cmd_edit_', ''), 10);
    const cmd = customCommandService.getCommandById(cmdId);
    if (!cmd) throw new Error('Not found.');
    if (value === 'preview') {
      const resp = customCommandService.buildResponse(cmd);
      return interaction.reply({ ...resp, ephemeral: true });
    }
    if (value === 'ephemeral') {
      customCommandService.updateCommand(cmdId, { ephemeral: cmd.ephemeral ? 0 : 1 });
      return interaction.reply({ embeds: [successEmbed('Updated', `Ephemeral: ${!cmd.ephemeral}`)], ephemeral: true });
    }
    const modal = new ModalBuilder().setCustomId(`edit_cmd_${cmdId}_${value}`).setTitle('Edit Command');
    let label = 'Value';
    let style = TextInputStyle.Short;
    let def = '';
    if (value === 'title') { label = 'Embed Title'; def = cmd.embed_title || ''; }
    if (value === 'description') { label = 'Description'; style = TextInputStyle.Paragraph; def = cmd.embed_description || ''; }
    if (value === 'footer') { label = 'Footer'; def = cmd.embed_footer || ''; }
    if (value === 'color') { label = 'Color hex'; def = cmd.embed_color || '#5865F2'; }
    if (value === 'add_field') { label = 'name|value'; }
    if (value === 'add_button') { label = 'label|url'; }
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(style).setRequired(true)
        .setValue(def.slice(0, style === TextInputStyle.Paragraph ? 1000 : 100))
    ));
    return interaction.showModal(modal);
  }
}

async function handleRoleSelect(interaction) {
  const id = interaction.customId;
  const roleId = interaction.values[0];

  if (id === 'perm_role_select') return showPermissionEditor(interaction, roleId, false);
  if (id === 'config_role_support') {
    updateSettings(interaction.guildId, { support_role_id: roleId });
    return interaction.reply({ embeds: [successEmbed('Updated', `Support role → <@&${roleId}>`)], ephemeral: true });
  }
  if (id.startsWith('panel_staff_')) {
    const panelId = parseInt(id.replace('panel_staff_', ''), 10);
    panelService.updatePanel(panelId, { staff_role_id: roleId });
    return interaction.reply({ embeds: [successEmbed('Updated', `Staff role → <@&${roleId}>`)], ephemeral: true });
  }
}

async function handleChannelSelect(interaction) {
  const id = interaction.customId;
  const channelId = interaction.values[0];

  if (id.startsWith('set_log_')) {
    const field = id.replace('set_log_', '');
    updateSettings(interaction.guildId, { [field]: channelId });
    return interaction.reply({ embeds: [successEmbed('Logging Updated', `**${field}** → <#${channelId}>`)], ephemeral: true });
  }
  if (id.startsWith('config_channel_')) {
    const kind = id.replace('config_channel_', '');
    const map = {
      category: 'ticket_category_id',
      transcript: 'transcript_channel_id',
      forum: 'archive_forum_id',
      recovery: 'recovery_channel_id'
    };
    if (map[kind]) {
      updateSettings(interaction.guildId, { [map[kind]]: channelId });
      return interaction.reply({ embeds: [successEmbed('Updated', `${kind} → <#${channelId}>`)], ephemeral: true });
    }
  }
  if (id.startsWith('panel_cat_')) {
    const panelId = parseInt(id.replace('panel_cat_', ''), 10);
    panelService.updatePanel(panelId, { category_id: channelId });
    return interaction.reply({ embeds: [successEmbed('Updated', `Category → <#${channelId}>`)], ephemeral: true });
  }
}

async function handleUserSelect(interaction) {
  return interaction.reply({
    embeds: [infoEmbed('Info', 'Use `/globeworks-ticket add user:@User` inside a ticket.')],
    ephemeral: true
  });
}

module.exports = {
  handleSelect,
  handleRoleSelect,
  handleChannelSelect,
  handleUserSelect
};
