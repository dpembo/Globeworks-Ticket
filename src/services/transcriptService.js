const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getFormResponses, getPanel } = require('./ticketService');
const { COLORS } = require('../config/constants');

async function generateTranscript(guild, ticket, transcriptChannelId) {
  const channel = await guild.channels.fetch(ticket.channel_id || ticket.thread_id).catch(() => null);
  if (!channel) {
    throw new Error('Ticket channel not found for transcript.');
  }

  const messages = [];
  let lastId = null;
  // Fetch up to ~500 messages safely
  for (let i = 0; i < 10; i++) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts);
    if (batch.size === 0) break;
    const arr = [...batch.values()];
    messages.push(...arr);
    lastId = arr[arr.length - 1].id;
    if (batch.size < 100) break;
  }

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const panel = ticket.panel_id ? getPanel(ticket.panel_id) : null;
  const responses = getFormResponses(ticket.id);

  let text = `=== Ticket Transcript ===\n`;
  text += `Ticket: #${String(ticket.ticket_number).padStart(4, '0')}\n`;
  text += `Type: ${ticket.ticket_type || panel?.name || 'General'}\n`;
  text += `Creator: ${ticket.creator_id}\n`;
  text += `Claimant: ${ticket.claimant_id || 'None'}\n`;
  text += `Created: ${ticket.created_at}\n`;
  text += `Closed: ${ticket.closed_at || 'N/A'}\n`;
  text += `Closed By: ${ticket.closed_by || 'N/A'}\n`;
  text += `Close Reason: ${ticket.close_reason || 'N/A'}\n`;
  text += `\n--- Form Responses ---\n`;
  for (const r of responses) {
    text += `Q: ${r.question_text}\nA: ${r.answer}\n\n`;
  }
  text += `--- Messages (${messages.length}) ---\n\n`;

  for (const m of messages) {
    const time = new Date(m.createdTimestamp).toISOString();
    const author = m.author?.tag || m.author?.id || 'Unknown';
    let content = m.content || '';
    if (m.attachments.size) {
      content += ' [Attachments: ' + [...m.attachments.values()].map(a => a.url).join(', ') + ']';
    }
    if (m.embeds.length) {
      content += ` [Embeds: ${m.embeds.length}]`;
    }
    text += `[${time}] ${author}: ${content}\n`;
  }

  const buffer = Buffer.from(text, 'utf8');
  const file = new AttachmentBuilder(buffer, {
    name: `ticket-${String(ticket.ticket_number).padStart(4, '0')}-transcript.txt`
  });

  const target = await guild.channels.fetch(transcriptChannelId).catch(() => null);
  if (!target) throw new Error('Transcript channel not found.');

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📄 Transcript — Ticket #${String(ticket.ticket_number).padStart(4, '0')}`)
    .addFields(
      { name: 'Creator', value: `<@${ticket.creator_id}>`, inline: true },
      { name: 'Closed By', value: ticket.closed_by ? `<@${ticket.closed_by}>` : '—', inline: true },
      { name: 'Messages', value: String(messages.length), inline: true }
    )
    .setTimestamp();

  await target.send({ embeds: [embed], files: [file] });
  return true;
}

module.exports = { generateTranscript };
