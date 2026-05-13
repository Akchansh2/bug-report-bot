const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_TOKEN      = process.env.BOT_TOKEN;
const CHANNEL_ID     = process.env.CHANNEL_ID;
const PORT           = process.env.PORT || 3000;
const API_SECRET     = process.env.API_SECRET; // optional shared secret for security

// ── Discord client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once('ready', () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);
});

// ── Priority helpers ──────────────────────────────────────────────────────────
const PRIORITY_COLOR = { Low: 0x23a55a, Medium: 0xf0b132, High: 0xf23f42 };
const PRIORITY_DOT   = { Low: '🟢', Medium: '🟡', High: '🔴' };

// ── Express server ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check — Render pings this to keep the service alive
app.get('/', (req, res) => res.send('Bug bot is running.'));

// POST /report — called by your bug portal's script.js
app.post('/report', async (req, res) => {
  // Optional API secret check
  if (API_SECRET && req.headers['x-api-secret'] !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { discord_username, category, priority, description, steps } = req.body;

  if (!discord_username || !category || !priority || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);

    // ── Channel embed ─────────────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setTitle(`${PRIORITY_DOT[priority] ?? '⚪'} New Bug Report — ${category}`)
      .setColor(PRIORITY_COLOR[priority] ?? 0x99aab5)
      .addFields(
        { name: 'Reported by',  value: discord_username, inline: true },
        { name: 'Priority',     value: priority,          inline: true },
        { name: 'Category',     value: category,          inline: true },
        { name: 'Description',  value: description.slice(0, 1024) },
        ...(steps ? [{ name: 'Steps to Reproduce', value: steps.slice(0, 1024) }] : []),
      )
      .setFooter({ text: 'Bug Reporting Portal' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // ── DM confirmation ───────────────────────────────────────────────────────
    // Look up the user by username in the guild
    const guild = channel.guild;
    await guild.members.fetch(); // cache all members
    const member = guild.members.cache.find(
      m => m.user.username.toLowerCase() === discord_username.toLowerCase()
        || m.user.tag.toLowerCase() === discord_username.toLowerCase()
    );

    if (member) {
      const dm = new EmbedBuilder()
        .setTitle('✅ Bug Report Received')
        .setColor(0x23a55a)
        .setDescription(`Hey **${member.user.username}**, thanks for the report! We've logged it and will look into it shortly.`)
        .addFields(
          { name: 'Category', value: category,  inline: true },
          { name: 'Priority', value: `${PRIORITY_DOT[priority] ?? ''} ${priority}`, inline: true },
        )
        .setFooter({ text: 'Bug Reporting Portal' })
        .setTimestamp();

      await member.send({ embeds: [dm] }).catch(() => {
        console.log(`Could not DM ${discord_username} — DMs may be closed.`);
      });
    } else {
      console.log(`User "${discord_username}" not found in guild — skipping DM.`);
    }

    res.json({ ok: true });

  } catch (err) {
    console.error('Error handling report:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN).then(() => {
  app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
});
