const mainCommand = require('../commands/globeworks-ticket');
const customCommandService = require('../services/customCommandService');
const { handleButton } = require('../components/buttons/index');
const { handleSelect, handleRoleSelect, handleChannelSelect, handleUserSelect } = require('../components/selects/index');
const { handleModal } = require('../modals/index');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'globeworks-ticket') {
          const sub = interaction.options.getSubcommand(false);
          const group = interaction.options.getSubcommandGroup(false);
          if (!group && sub) {
            const custom = customCommandService.getCommandByName(interaction.guildId, sub);
            if (custom && custom.enabled) {
              const { handleCustomCommandRun } = require('../components/buttons/index');
              return handleCustomCommandRun(interaction, custom);
            }
          }
          return mainCommand.execute(interaction);
        }
        return;
      }

      if (interaction.isButton()) return handleButton(interaction);
      if (interaction.isStringSelectMenu()) return handleSelect(interaction);
      if (interaction.isRoleSelectMenu()) return handleRoleSelect(interaction);
      if (interaction.isChannelSelectMenu()) return handleChannelSelect(interaction);
      if (interaction.isUserSelectMenu()) return handleUserSelect(interaction);
      if (interaction.isModalSubmit()) return handleModal(interaction);
    } catch (err) {
      console.error('[Interaction Error]', err);
      const payload = {
        embeds: [errorEmbed('Error', err.message || 'Something went wrong.')],
        ephemeral: true
      };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch (_) {}
    }
  }
};
