// index.js
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("ERROR: Missing TOKEN environment variable. Set TOKEN in Render/Env or .env for local.");
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, "giveaways.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
let giveaways = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); // array of giveaway objects
const timers = new Map();

function saveGiveaways() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(giveaways, null, 2));
}

// parse time strings like "10s", "5m", "2h", "1d"
function parseDuration(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return null;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once("ready", () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  // schedule existing giveaways after restart
  for (const g of giveaways) scheduleGiveaway(g);
});

// schedule a giveaway finish
function scheduleGiveaway(g) {
  const remaining = g.endTime - Date.now();
  if (remaining <= 0) {
    // already past due -> finish immediately
    finishGiveaway(g);
    return;
  }
  if (timers.has(g.messageId)) {
    clearTimeout(timers.get(g.messageId));
  }
  const t = setTimeout(() => finishGiveaway(g), remaining);
  timers.set(g.messageId, t);
}

// finish logic
async function finishGiveaway(g) {
  try {
    const channel = await client.channels.fetch(g.channelId).catch(()=>null);
    if (!channel) {
      console.warn("Channel not found for giveaway", g.messageId);
    } else {
      const msg = await channel.messages.fetch(g.messageId).catch(()=>null);
      // collect participants from saved list + reaction users
      let reactionIds = [];
      if (msg) {
        const fetchedReactions = await msg.reactions.fetch().catch(()=>null);
        const react = fetchedReactions ? fetchedReactions.get("🎉") : null;
        if (react) {
          const users = await react.users.fetch().catch(()=>null);
          if (users) {
            reactionIds = users.filter(u => !u.bot).map(u => u.id);
          }
        }
      }

      const savedIds = Array.isArray(g.participants) ? g.participants.slice() : [];
      const allIdsSet = new Set([...savedIds, ...reactionIds]);
      const allIds = Array.from(allIdsSet);

      let winners = [];
      if (allIds.length > 0) {
        const pool = allIds.slice();
        const pick = Math.min(g.winnerCount, pool.length);
        for (let i = 0; i < pick; i++) {
          const idx = Math.floor(Math.random() * pool.length);
          winners.push(pool.splice(idx, 1)[0]);
        }
      }

      const winEmbed = new EmbedBuilder()
        .setTitle("🎊 GIVEAWAY KẾT THÚC 🎊")
        .setColor(0x2ecc71)
        .setTimestamp(new Date())
        .setFooter({ text: "Giveaway đã kết thúc" });

      if (winners.length > 0) {
        winEmbed.setDescription(`💎 Phần thưởng: **${g.prize}**\n🏆 Người thắng: ${winners.map(id => `<@${id}>`).join(", ")}`);
      } else {
        winEmbed.setDescription(`💎 Phần thưởng: **${g.prize}**\n❌ Không có ai tham gia.`);
      }

      await channel.send({ embeds: [winEmbed] }).catch(console.error);
    }
  } catch (err) {
    console.error("Error finishing giveaway:", err);
  } finally {
    // remove giveaway from list, save, clear timer
    giveaways = giveaways.filter(x => x.messageId !== g.messageId);
    saveGiveaways();
    if (timers.has(g.messageId)) {
      clearTimeout(timers.get(g.messageId));
      timers.delete(g.messageId);
    }
  }
}

// handle commands (prefix = "!")
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!") || message.author.bot) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (cmd === "ping") {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    return message.reply(`🏓 Pong! Ping: ${client.ws.ping}ms | Uptime: ${h}h ${m}m ${s}s`);
  }

  // !ga <time> <winners> <prize...>
  if (cmd === "ga") {
    if (!message.member.permissions.has("ManageMessages") && !message.member.permissions.has("Administrator")) {
      return message.reply("❌ Bạn cần quyền Manage Messages hoặc Administrator để tạo giveaway.");
    }

    if (args.length < 3) {
      return message.reply("❌ Sai cú pháp!\nVí dụ: `!ga 1m 2 Nitro` (1m = 1 phút, s/m/h/d)");
    }

    const timeStr = args[0];
    const duration = parseDuration(timeStr);
    const winnerCount = parseInt(args[1], 10);
    const prize = args.slice(2).join(" ");
    if (!duration || isNaN(winnerCount) || !prize) {
      return message.reply("❌ Thời gian/ số người/ giải thưởng không hợp lệ.");
    }

    const endTime = Date.now() + duration;
    const embed = new EmbedBuilder()
      .setTitle("🎉 GIVEAWAY ĐANG DIỄN RA 🎉")
      .setColor(0xffc107)
      .addFields(
        { name: "💎 Giải thưởng", value: prize, inline: true },
        { name: "🏆 Số người thắng", value: `${winnerCount}`, inline: true },
        { name: "⏰ Kết thúc", value: `<t:${Math.floor(endTime/1000)}:F> (\`<t:${Math.floor(endTime/1000)}:R>\`)`, inline: false }
      )
      .setFooter({ text: `Tạo bởi ${message.author.tag}` });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("join_giveaway_TEMP") // will replace after sending (we need message id)
        .setLabel("🎉 Tham gia")
        .setStyle(ButtonStyle.Primary)
    );

    const sent = await message.channel.send({ embeds: [embed], components: [button] });
    // set unique customId with message id so each button is unique
    const customId = `join_giveaway_${sent.id}`;
    // edit message to set correct customId
    const updatedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel("🎉 Tham gia")
        .setStyle(ButtonStyle.Primary)
    );
    await sent.edit({ components: [updatedRow] }).catch(()=>{});

    // react too (for users who prefer reaction)
    await sent.react("🎉").catch(()=>{});

    const newG = {
      messageId: sent.id,
      channelId: message.channel.id,
      prize,
      winnerCount,
      endTime,
      participants: [] // store user ids who used button / join list
    };
    giveaways.push(newG);
    saveGiveaways();
    scheduleGiveaway(newG);

    return message.reply(`✅ Giveaway đã tạo: **${prize}** | Kết thúc: <t:${Math.floor(endTime/1000)}:F>`);
  }

  // !listga
  if (cmd === "listga") {
    if (!giveaways.length) return message.reply("📭 Hiện không có giveaway nào đang chạy.");
    const now = Date.now();
    const lines = giveaways.map(g => {
      const rem = Math.max(0, Math.floor((g.endTime - now)/1000));
      return `🎁 **${g.prize}** | 🏆 ${g.winnerCount} | ⏳ còn ${rem}s | 🆔 ${g.messageId}`;
    }).join("\n\n");
    return message.channel.send({ embeds: [ new EmbedBuilder().setTitle("📋 Giveaway đang chạy").setDescription(lines).setColor(0x00ffcc) ] });
  }

  // !reroll <messageId>
  if (cmd === "reroll") {
    if (!message.member.permissions.has("ManageMessages") && !message.member.permissions.has("Administrator")) {
      return message.reply("❌ Bạn cần quyền Manage Messages hoặc Administrator để reroll.");
    }
    const id = args[0];
    if (!id) return message.reply("❌ Dùng: `!reroll <messageId>`");
    const g = giveaways.find(x => x.messageId === id);
    if (!g) return message.reply("❌ Không tìm thấy giveaway với ID này.");
    try {
      const channel = await client.channels.fetch(g.channelId);
      const msg = await channel.messages.fetch(g.messageId);
      const react = (await msg.reactions.fetch()).get("🎉");
      let reactionIds = [];
      if (react) {
        const users = await react.users.fetch();
        reactionIds = users.filter(u => !u.bot).map(u => u.id);
      }
      const allIds = Array.from(new Set([...(g.participants||[]), ...reactionIds]));
      if (!allIds.length) return message.reply("❌ Không có ai tham gia để reroll.");
      const winners = [];
      const pool = allIds.slice();
      const pick = Math.min(g.winnerCount, pool.length);
      for (let i=0;i<pick;i++){
        const idx = Math.floor(Math.random()*pool.length);
        winners.push(pool.splice(idx,1)[0]);
      }
      return message.channel.send({ embeds: [ new EmbedBuilder().setTitle("🔁 Reroll Giveaway").setDescription(`Phần thưởng: **${g.prize}**\nNgười thắng mới: ${winners.map(id=>`<@${id}>`).join(", ")}`).setColor(0xe67e22) ] });
    } catch (err) {
      console.error(err);
      return message.reply("❌ Lỗi khi reroll.");
    }
  }

  // !endga <messageId>  -> kết thúc ngay
  if (cmd === "endga") {
    if (!message.member.permissions.has("ManageMessages") && !message.member.permissions.has("Administrator")) {
      return message.reply("❌ Bạn cần quyền Manage Messages hoặc Administrator để end giveaway.");
    }
    const id = args[0];
    if (!id) return message.reply("❌ Dùng: `!endga <messageId>`");
    const g = giveaways.find(x => x.messageId === id);
    if (!g) return message.reply("❌ Không tìm thấy giveaway.");
    g.endTime = Date.now();
    saveGiveaways();
    scheduleGiveaway(g); // scheduling will notice endTime <= now and finish immediately
    return message.reply(`✅ Giveaway ${id} đã được đặt để kết thúc ngay.`);
  }
});

// handle button clicks (join)
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    if (!customId.startsWith("join_giveaway_")) return;
    const messageId = customId.replace("join_giveaway_", "");
    const g = giveaways.find(x => x.messageId === messageId);
    if (!g) return interaction.reply({ content: "❌ Giveaway không tồn tại hoặc đã kết thúc.", ephemeral: true });

    const userId = interaction.user.id;
    if (!g.participants) g.participants = [];
    if (!g.participants.includes(userId)) {
      g.participants.push(userId);
      saveGiveaways();
      await interaction.reply({ content: "✅ Bạn đã tham gia giveaway!", ephemeral: true });
    } else {
      await interaction.reply({ content: "ℹ️ Bạn đã tham gia rồi.", ephemeral: true });
    }
  } catch (err) {
    console.error("interactionCreate error:", err);
  }
});

// handle reaction add (join by reaction)
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message && reaction.message.partial) await reaction.message.fetch();
    if (reaction.emoji && reaction.emoji.name !== "🎉") return;
    const g = giveaways.find(x => x.messageId === reaction.message.id);
    if (!g) return;
    if (!g.participants) g.participants = [];
    if (!g.participants.includes(user.id)) {
      g.participants.push(user.id);
      saveGiveaways();
    }
  } catch (err) {
    console.error("messageReactionAdd error:", err);
  }
});

client.login(TOKEN);
