const { Client, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const PREFIX = "!";
let giveaways = [];

// Đọc file lưu giveaway
if (fs.existsSync("giveaways.json")) {
  giveaways = JSON.parse(fs.readFileSync("giveaways.json", "utf8"));
}

// Lưu file
function saveGiveaways() {
  fs.writeFileSync("giveaways.json", JSON.stringify(giveaways, null, 2));
}

// Convert time (1m, 1h, 1d)
function ms(time) {
  const num = parseInt(time);
  if (time.endsWith("s")) return num * 1000;
  if (time.endsWith("m")) return num * 60 * 1000;
  if (time.endsWith("h")) return num * 60 * 60 * 1000;
  if (time.endsWith("d")) return num * 24 * 60 * 60 * 1000;
  return num;
}

client.once("ready", () => {
  console.log(`✅ Bot đã online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // Ping
  if (cmd === "ping") {
    return message.reply("🏓 Pong! Bot đang hoạt động.");
  }

  // Giveaway
  if (cmd === "ga") {
    if (args.length < 3) {
      return message.reply("❌ Dùng: `!ga <time> <winnerCount> <prize>`\nVD: `!ga 1m 1 Nitro`");
    }

    const duration = ms(args[0]);
    const winnerCount = parseInt(args[1]);
    const prize = args.slice(2).join(" ");
    const endTime = Date.now() + duration;

    const embed = {
      title: "🎉 GIVEAWAY ĐANG DIỄN RA 🎉",
      description: `💎 Phần thưởng: **${prize}**\n🏆 Số người thắng: **${winnerCount}**\n⏰ Thời gian: **${args[0]}**\n\n👉 React 🎉 để tham gia ngay!`,
      color: 0xffc107,
      timestamp: new Date(endTime),
      footer: { text: "Giveaway kết thúc vào" }
    };

    const msg = await message.channel.send({ embeds: [embed] });
    await msg.react("🎉");

    giveaways.push({
      messageId: msg.id,
      channelId: message.channel.id,
      prize,
      winnerCount,
      endTime
    });
    saveGiveaways();
  }

  // Reroll
  if (cmd === "reroll") {
    if (!args[0]) return message.reply("❌ Dùng: `!reroll <messageId>`");
    const giveaway = giveaways.find(g => g.messageId === args[0]);
    if (!giveaway) return message.reply("❌ Không tìm thấy giveaway!");

    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      const msg = await channel.messages.fetch(giveaway.messageId);
      const reaction = msg.reactions.cache.get("🎉");
      const users = await reaction.users.fetch();
      const validUsers = users.filter(u => !u.bot).map(u => u);

      if (validUsers.length === 0) {
        return message.channel.send("❌ Không có ai tham gia.");
      }

      const winners = [];
      for (let i = 0; i < giveaway.winnerCount; i++) {
        const winner = validUsers[Math.floor(Math.random() * validUsers.length)];
        if (!winners.includes(winner)) winners.push(winner);
      }

      const winEmbed = {
        title: "🎊 GIVEAWAY REROLL 🎊",
        description: `Phần thưởng: **${giveaway.prize}**\nNgười thắng mới: ${winners.map(w => `<@${w.id}>`).join(", ")}`,
        color: 0x3498db,
        timestamp: new Date(),
        footer: { text: "Chúc mừng người chiến thắng mới!" }
      };
      message.channel.send({ embeds: [winEmbed] });
    } catch (err) {
      console.error(err);
      message.reply("❌ Có lỗi khi reroll!");
    }
  }

  // List giveaway
  if (cmd === "listga") {
    if (giveaways.length === 0) {
      return message.reply("📭 Hiện tại không có giveaway nào đang chạy.");
    }

    const now = Date.now();
    const list = giveaways.map(g => {
      const remaining = g.endTime - now;
      const seconds = Math.max(0, Math.floor(remaining / 1000));
      return `🎁 **${g.prize}** | 🏆 ${g.winnerCount} winner(s) | ⏳ còn ${seconds}s | 🆔 ${g.messageId}`;
    }).join("\n\n");

    message.channel.send({
      embeds: [{
        title: "📋 Danh sách Giveaway đang chạy",
        description: list,
        color: 0x00ffcc
      }]
    });
  }
});

// Check giveaway kết thúc
setInterval(async () => {
  const now = Date.now();
  for (let i = giveaways.length - 1; i >= 0; i--) {
    const giveaway = giveaways[i];
    if (now >= giveaway.endTime) {
      try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const msg = await channel.messages.fetch(giveaway.messageId);
        const reaction = msg.reactions.cache.get("🎉");
        const users = await reaction.users.fetch();
        const validUsers = users.filter(u => !u.bot).map(u => u);

        let winners = [];
        if (validUsers.length > 0) {
          for (let j = 0; j < giveaway.winnerCount; j++) {
            const winner = validUsers[Math.floor(Math.random() * validUsers.length)];
            if (!winners.includes(winner)) winners.push(winner);
          }
        }

        const winEmbed = {
          title: "🎊 GIVEAWAY KẾT THÚC 🎊",
          description: winners.length > 0
            ? `Phần thưởng: **${giveaway.prize}**\nNgười thắng: ${winners.map(w => `<@${w.id}>`).join(", ")}`
            : `Phần thưởng: **${giveaway.prize}**\n❌ Không có ai tham gia.`,
          color: 0x2ecc71,
          timestamp: new Date(),
          footer: { text: "Giveaway đã kết thúc" }
        };

        channel.send({ embeds: [winEmbed] });
      } catch (err) {
        console.error("Lỗi khi kết thúc giveaway:", err);
      }
      giveaways.splice(i, 1);
      saveGiveaways();
    }
  }
}, 5000);

client.login(process.env.DISCORD_TOKEN);
