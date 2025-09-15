const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ],
});

let giveaways = [];
const dataFile = "giveaways.json";

// Load dữ liệu
if (fs.existsSync(dataFile)) {
  giveaways = JSON.parse(fs.readFileSync(dataFile));
}

// Lưu dữ liệu
function saveGiveaways() {
  fs.writeFileSync(dataFile, JSON.stringify(giveaways, null, 2));
}

// Lệnh tạo giveaway: !ga <thời gian giây> <số người thắng> <giải thưởng>
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!ga")) return;

  const args = msg.content.split(" ");
  const duration = parseInt(args[1]) * 1000;
  const winnersCount = parseInt(args[2]);
  const prize = args.slice(3).join(" ");
  const endTime = Date.now() + duration;

  const embed = new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY 🎉")
    .setDescription(`Bấm ✨ để tham gia giveaway!\n\n🎁 **Giải thưởng:** ${prize}\n🏆 **Số người thắng:** ${winnersCount}\n⏰ **Còn lại:** <t:${Math.floor(endTime / 1000)}:R>`)
    .setColor("Pink")
    .setThumbnail(msg.author.displayAvatarURL());

  const giveawayMsg = await msg.channel.send({ embeds: [embed] });
  await giveawayMsg.react("✨");

  giveaways.push({
    messageId: giveawayMsg.id,
    channelId: msg.channel.id,
    prize,
    winnersCount,
    endTime,
    users: []
  });

  saveGiveaways();
});

// Người dùng tham gia
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  const giveaway = giveaways.find(g => g.messageId === reaction.message.id);
  if (giveaway && reaction.emoji.name === "✨") {
    if (!giveaway.users.includes(user.id)) {
      giveaway.users.push(user.id);
      saveGiveaways();
    }
  }
});

// Check winner mỗi 5s
setInterval(async () => {
  const now = Date.now();
  for (const g of giveaways) {
    if (g.endTime <= now && !g.ended) {
      g.ended = true;
      const channel = await client.channels.fetch(g.channelId);
      const message = await channel.messages.fetch(g.messageId);
      const winners = [];

      for (let i = 0; i < g.winnersCount; i++) {
        const winner = g.users[Math.floor(Math.random() * g.users.length)];
        if (winner && !winners.includes(winner)) winners.push(winner);
      }

      channel.send(`🎉 Giveaway kết thúc!\n🏆 Người thắng: ${winners.map(w => `<@${w}>`).join(", ") || "Không có ai"}\n🎁 Giải thưởng: **${g.prize}**`);
      saveGiveaways();
    }
  }
}, 5000);

client.login(process.env.DISCORD_TOKEN);  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return null;
}

// Tạo embed giống mẫu: title, thumbnail, fields, footer
function makeGiveawayEmbed(prize, winnersCount, endAt, host) {
  const embed = new EmbedBuilder()
    .setColor(0xffb6c1) // màu pink nhẹ
    .setTitle(`✨ GIVEAWAY ✨`)
    .setDescription(`Bấm ${JOIN_EMOJI} để tham gia giveaway!`)
    .setThumbnail(host.displayAvatarURL({ extension: "png", size: 512 }))
    .addFields(
      { name: "⏳ Còn lại", value: `<t:${Math.floor(endAt/1000)}:R>`, inline: false },
      { name: "🎁 Giải thưởng", value: `${prize}`, inline: false },
      { name: "👥 Số người thắng", value: `${winnersCount}`, inline: false }
    )
    .setFooter({ text: `Làm bởi: ${host.tag}`, iconURL: host.displayAvatarURL({ size: 32 }) })
    .setTimestamp(endAt);
  return embed;
}

async function scheduleGiveaway(gw) {
  // nếu đã kết thúc thì end luôn
  const delay = gw.endAt - Date.now();
  if (delay <= 0) {
    await finishGiveawayByData(gw).catch(console.error);
    return;
  }
  setTimeout(async () => {
    await finishGiveawayByData(gw).catch(console.error);
  }, delay);
}

async function finishGiveawayByData(gw) {
  try {
    const channel = await client.channels.fetch(gw.channelId).catch(() => null);
    if (!channel) {
      // xóa nếu channel không tồn tại
      giveaways = giveaways.filter(x => x.messageId !== gw.messageId);
      saveDB();
      return;
    }
    const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
    if (!msg) {
      giveaways = giveaways.filter(x => x.messageId !== gw.messageId);
      saveDB();
      return;
    }

    const reaction = msg.reactions.cache.get(JOIN_EMOJI) || msg.reactions.cache.find(r => r.emoji.name === JOIN_EMOJI);
    if (!reaction) {
      await channel.send("❌ Không có ai tham gia giveaway.");
      giveaways = giveaways.filter(x => x.messageId !== gw.messageId);
      saveDB();
      return;
    }

    const users = await reaction.users.fetch();
    const participants = users.filter(u => !u.bot).map(u => u.id);
    if (participants.length === 0) {
      await channel.send("😢 Không có ai tham gia giveaway.");
      giveaways = giveaways.filter(x => x.messageId !== gw.messageId);
      saveDB();
      return;
    }

    const winners = [];
    while (winners.length < Math.min(gw.winnersCount, participants.length)) {
      const pick = participants[Math.floor(Math.random() * participants.length)];
      if (!winners.includes(pick)) winners.push(pick);
    }

    await channel.send(`🎉 Chúc mừng ${winners.map(id => `<@${id}>`).join(", ")} đã thắng **${gw.prize}**!`);
    // DM winners (nếu muốn)
    for (const id of winners) {
      try {
        const user = await client.users.fetch(id);
        await user.send(`🎉 Chúc mừng! Bạn đã thắng **${gw.prize}** trong server **${channel.guild.name}**.`);
      } catch (e) {
        // không ép phải DM được
      }
    }

    // xóa khỏi DB
    giveaways = giveaways.filter(x => x.messageId !== gw.messageId);
    saveDB();
  } catch (err) {
    console.error("finishGiveaway error:", err);
  }
}

// Khi bot bật lại, schedule các giveaway còn sống
client.once("ready", async () => {
  console.log("Bot ready:", client.user.tag);
  for (const gw of giveaways.slice()) {
    // đảm bảo guild & channel tồn tại
    scheduleGiveaway(gw);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  // Cú pháp: !ga <time> <winners> <prize...>
  // Ví dụ: !ga 60s 1 Nitro
  const timeStr = args[0];
  const winnersCount = parseInt(args[1], 10);
  const prize = args.slice(2).join(" ");
  if (!timeStr || !winnersCount || !prize) {
    return message.reply("❌ Cú pháp: `!ga <time> <winners> <prize>`\nVí dụ: `!ga 60s 1 Nitro` (time: 30s, 5m, 2h, 1d)");
  }

  const duration = msParse(timeStr);
  if (!duration) return message.reply("❌ Thời gian không hợp lệ. Dùng s/m/h/d (ví dụ 30s, 5m, 2h).");

  const endAt = Date.now() + duration;
  const embed = makeGiveawayEmbed(prize, winnersCount, endAt, message.author);
  const sent = await message.channel.send({ embeds: [embed] });

  // React bằng emoji Unicode an toàn
  try {
    await sent.react(JOIN_EMOJI);
  } catch (err) {
    console.error("React failed:", err);
    message.reply("⚠️ Bot không thể react emoji. Hãy chắc bot có quyền Add Reactions và Use External Emojis (nếu emoji custom).");
  }

  // Lưu giveaway
  const gwData = {
    messageId: sent.id,
    channelId: message.channel.id,
    guildId: message.guild.id,
    prize,
    winnersCount,
    endAt,
    hostId: message.author.id
  };
  giveaways.push(gwData);
  saveDB();

  scheduleGiveaway(gwData);

  // Trả về messageId để admin có thể end thủ công nếu muốn
  message.reply(`✅ Giveaway tạo thành công! ID: \`${sent.id}\`. Bot sẽ kết thúc tự động <t:${Math.floor(endAt/1000)}:R>.`);
});

// Tự end bằng lệnh (admin): !ga end <messageId>
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  if (args[0] === "end" && args[1]) {
    const id = args[1];
    const gw = giveaways.find(x => x.messageId === id);
    if (!gw) return message.reply("❌ Không tìm thấy giveaway với messageId đó.");
    await finishGiveawayByData(gw);
    return message.reply("🔔 Giveaway đã được kết thúc (manual).");
  }
});

client.login(TOKEN);
  if (cmd === "ga") {
    const time = ms(args[0]);
    const winners = parseInt(args[1]);
    const prize = args.slice(2).join(" ");

    if (!time || !winners || !prize) {
      return message.reply("❌ Cú pháp: `!ga <time> <winners> <prize>`\nVD: `!ga 60s 1 Nitro`");
    }

    const giveawayMsg = await message.channel.send(
      `🎉 **GIVEAWAY** 🎉\n\nGiải thưởng: **${prize}**\nSố người thắng: **${winners}**\nThời gian: **${args[0]}**\n\nReact với ${EMOJI_JOIN} để tham gia!`
    );

    try {
      await giveawayMsg.react(EMOJI_JOIN);
    } catch (err) {
      return message.reply("⚠️ Bot không react được emoji này, hãy chắc chắn bot có trong server chứa emoji.");
    }

    const newGiveaway = {
      messageId: giveawayMsg.id,
      channelId: message.channel.id,
      prize,
      winners,
      endAt: Date.now() + time
    };

    giveaways.push(newGiveaway);
    saveGiveaways();

    setTimeout(async () => {
      const channel = await client.channels.fetch(newGiveaway.channelId);
      const msg = await channel.messages.fetch(newGiveaway.messageId);

      const reaction = msg.reactions.cache.find(r => r.emoji.toString() === EMOJI_JOIN);
      if (!reaction) return channel.send("❌ Không tìm thấy reaction cho giveaway.");

      const users = await reaction.users.fetch();
      const participants = users.filter(u => !u.bot).map(u => u);

      if (participants.length === 0) {
        channel.send("❌ Không có ai tham gia giveaway.");
        return;
      }

      const winnersPicked = [];
      for (let i = 0; i < newGiveaway.winners; i++) {
        const winner = participants[Math.floor(Math.random() * participants.length)];
        if (!winnersPicked.includes(winner)) {
          winnersPicked.push(winner);
        }
      }

      channel.send(`🎊 Chúc mừng ${winnersPicked.map(w => w.toString()).join(", ")} đã thắng **${newGiveaway.prize}** 🎊`);
    }, time);
  }
});

function ms(str) {
  const match = str.match(/(\d+)([smhd])/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  if (unit === "s") return num * 1000;
  if (unit === "m") return num * 60 * 1000;
  if (unit === "h") return num * 60 * 60 * 1000;
  if (unit === "d") return num * 24 * 60 * 60 * 1000;
  return null;
}

client.login(process.env.DISCORD_TOKEN);
}
