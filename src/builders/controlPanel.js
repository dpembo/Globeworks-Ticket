const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const { controlPanelEmbed } = require('../utils/embeds');
const { hasDiscordAdmin, memberHasPermission } = require('../utils/permissions');
const { PERMISSIONS } = require('../config/constants');

function mainMenuComponents(member) {
  const isAdmin = hasDiscordAdmin(member);
  const canManage = isAdmin || memberHasPermission(member, PERMISSIONS.MANAGE_SETTINGS);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cp_tickets').setLabel('Tickets').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
    new ButtonBuilder().setCustomId('cp_panels').setLabel('Panels').setStyle(ButtonStyle.Primary).setEmoji('🎟️'),
    new ButtonBuilder().setCustomId('cp_applications').setLabel('Applications').setStyle(ButtonStyle.Primary).setEmoji('📋'),
    new ButtonBuilder().setCustomId('cp_archives').setLabel('Archives').setStyle(ButtonStyle.Secondary).setEmoji('📦')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cp_permissions').setLabel('Permissions').setStyle(ButtonStyle.Secondary).setEmoji('🔐').setDisabled(!canManage),
    new ButtonBuilder().setCustomId('cp_logging').setLabel('Logging').setStyle(ButtonStyle.Secondary).setEmoji('📜').setDisabled(!canManage),
    new ButtonBuilder().setCustomId('cp_custom').setLabel('Custom Commands').setStyle(ButtonStyle.Secondary).setEmoji('🛠️').setDisabled(!canManage),
    new ButtonBuilder().setCustomId('cp_config').setLabel('Configuration').setStyle(ButtonStyle.Secondary).setEmoji('⚙️').setDisabled(!canManage)
  );

  return [row1, row2];
}

function ticketsMenu() {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cp_ticket_action')
      .setPlaceholder('Select a ticket action')
      .addOptions(
        { label: 'Close', value: 'close', emoji: '🔒', description: 'Close the current ticket' },
        { label: 'Reopen', value: 'reopen', emoji: '🔓', description: 'Reopen a closed ticket' },
        { label: 'Claim', value: 'claim', emoji: '📌', description: 'Claim this ticket' },
        { label: 'Unclaim', value: 'unclaim', emoji: '📌', description: 'Release claim' },
        { label: 'Add User', value: 'add', emoji: '➕', description: 'Add a user to the ticket' },
        { label: 'Remove User', value: 'remove', emoji: '➖', description: 'Remove a user' },
        { label: 'Rename', value: 'rename', emoji: '✏️', description: 'Rename the ticket channel' },
        { label: 'Info', value: 'info', emoji: 'ℹ️', description: 'Show ticket information' },
        { label: 'Transcript', value: 'transcript', emoji: '📄', description: 'Generate transcript' },
        { label: 'Delete', value: 'delete', emoji: '🗑️', description: 'Permanently delete ticket' }
      )
  );
  const nav = navRow('cp_main');
  return [row, nav];
}

function panelsMenu() {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cp_panel_action')
      .setPlaceholder('Select a panel action')
      .addOptions(
        { label: 'Create Panel', value: 'create', emoji: '➕' },
        { label: 'Edit Panel', value: 'edit', emoji: '✏️' },
        { label: 'Delete Panel', value: 'delete', emoji: '🗑️' },
        { label: 'List Panels', value: 'list', emoji: '📋' },
        { label: 'Send Panel', value: 'send', emoji: '📤' }
      )
  );
  return [row, navRow('cp_main')];
}

function applicationsMenu() {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cp_app_action')
      .setPlaceholder('Select an application action')
      .addOptions(
        { label: 'Create Application', value: 'create', emoji: '➕' },
        { label: 'Edit Application', value: 'edit', emoji: '✏️' },
        { label: 'Delete Application', value: 'delete', emoji: '🗑️' },
        { label: 'List Applications', value: 'list', emoji: '📋' },
        { label: 'Send Application', value: 'send', emoji: '📤' },
        { label: 'Review', value: 'review', emoji: '👁️' }
      )
  );
  return [row, navRow('cp_main')];
}

function archivesMenu() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cp_archive_browse').setLabel('Browse Archived').setStyle(ButtonStyle.Primary).setEmoji('📦'),
    new ButtonBuilder().setCustomId('cp_archive_search').setLabel('Search').setStyle(ButtonStyle.Secondary).setEmoji('🔍')
  );
  return [row, navRow('cp_main')];
}

function configMenu() {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cp_config_section')
      .setPlaceholder('Select configuration section')
      .addOptions(
        { label: 'General / Archives', value: 'general', emoji: '⚙️' },
        { label: 'Ticket Category', value: 'category', emoji: '📁' },
        { label: 'Support Role', value: 'role', emoji: '👤' },
        { label: 'Transcript Channel', value: 'transcript', emoji: '📄' },
        { label: 'Archive Forum', value: 'forum', emoji: '📦' },
        { label: 'Recovery Channel', value: 'recovery', emoji: '♻️' },
        { label: 'Recovery Days', value: 'days', emoji: '📅' },
        { label: 'View Current Config', value: 'view', emoji: '👁️' },
        { label: 'Reset Config', value: 'reset', emoji: '⚠️' }
      )
  );
  return [row, navRow('cp_main')];
}

function loggingMenu() {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cp_log_type')
      .setPlaceholder('Select log type to configure')
      .addOptions(
        { label: 'Ticket Creation', value: 'log_ticket_create' },
        { label: 'Ticket Closure', value: 'log_ticket_close' },
        { label: 'Ticket Deletion', value: 'log_ticket_delete' },
        { label: 'Claim / Unclaim', value: 'log_claim' },
        { label: 'Reopen', value: 'log_reopen' },
        { label: 'User Add/Remove', value: 'log_user_change' },
        { label: 'Applications', value: 'log_application' },
        { label: 'Permissions', value: 'log_permission' },
        { label: 'Configuration', value: 'log_config' },
        { label: 'Archive', value: 'log_archive' },
        { label: 'Restore', value: 'log_restore' },
        { label: 'Expiration', value: 'log_expire' },
        { label: 'Custom Commands', value: 'log_custom_command' }
      )
  );
  return [row, navRow('cp_main')];
}

function customCommandsMenu() {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cp_cmd_action')
      .setPlaceholder('Select custom command action')
      .addOptions(
        { label: 'Create Command', value: 'create', emoji: '➕' },
        { label: 'Edit Command', value: 'edit', emoji: '✏️' },
        { label: 'Delete Command', value: 'delete', emoji: '🗑️' },
        { label: 'List Commands', value: 'list', emoji: '📋' },
        { label: 'Enable', value: 'enable', emoji: '✅' },
        { label: 'Disable', value: 'disable', emoji: '❌' }
      )
  );
  return [row, navRow('cp_main')];
}

function navRow(...backIds) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder().setCustomId(backIds[0] || 'cp_main').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji('◀️'),
    new ButtonBuilder().setCustomId('cp_main').setLabel('Main Menu').setStyle(ButtonStyle.Primary).setEmoji('🏠')
  );
  return row;
}

function buildMainPanel(member) {
  return {
    embeds: [controlPanelEmbed()],
    components: mainMenuComponents(member),
    ephemeral: true
  };
}

module.exports = {
  buildMainPanel,
  mainMenuComponents,
  ticketsMenu,
  panelsMenu,
  applicationsMenu,
  archivesMenu,
  configMenu,
  loggingMenu,
  customCommandsMenu,
  navRow
};
