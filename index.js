const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_TOKEN  = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT       = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

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

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ── CORS — allow GitHub Pages and any browser to call this ───────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/', (req, res) => res.send('Bug bot is running.'));

// POST /report
app.post('/report', async (req, res) => {
  if (API_SECRET && req.headers['x-api-secret'] !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { discord_username, category, priority, description, steps } = req.body;

  if (!discord_username || !category || !priority || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);

    // Channel embed
    const embed = new EmbedBuilder()
      .setTitle(`${PRIORITY_DOT[priority] ?? '⚪'} New Bug Report — ${category}`)
      .setColor(PRIORITY_COLOR[priority] ?? 0x99aab5)
      .addFields(
        { name: 'Reported by', value: discord_username, inline: true },
        { name: 'Priority',    value: priority,          inline: true },
        { name: 'Category',    value: category,          inline: true },
        { name: 'Description', value: description.slice(0, 1024) },
        ...(steps ? [{ name: 'Steps to Reproduce', value: steps.slice(0, 1024) }] : []),
      )
      .setFooter({ text: 'Bug Reporting Portal' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // DM the reporter
    const guild = channel.guild;
    let member = null;
    try {
      const results = await guild.members.fetch({ query: discord_username.split('#')[0], limit: 10 });
      member = results.find(
        m => m.user.username.toLowerCase() === discord_username.toLowerCase()
          || m.user.tag.toLowerCase() === discord_username.toLowerCase()
          || m.displayName.toLowerCase() === discord_username.toLowerCase()
      ) || null;
    } catch (e) {
      console.log(`Member fetch failed: ${e.message}`);
    }

    if (member) {
      const dm = new EmbedBuilder()
        .setTitle('✅ Bug Report Received')
        .setColor(0x23a55a)
        .setDescription(`Hey **${member.user.username}**, thanks for the report! We've logged it and will look into it shortly.`)
        .addFields(
          { name: 'Category', value: category, inline: true },
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
