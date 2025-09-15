const { Client, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");

// ====== Load & lưu giveaway ======
let giveaways = [];
const giveawaysFile = "giveaways.json";
if (fs.existsSync(giveawaysFile)) {
  giveaways = JSON.parse(fs.readFileSync(giveawaysFile));
}
function saveGiveaways() {
  fs.writeFileSync(giveawaysFile, JSON.stringify(giveaways, null, 2));
}

// ====== Tạo client ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once("ready", () => {
  console.log(`✅ Bot đã online với tên: ${client.user.tag}`);
});

// ====== Hàm parse thời gian (10s, 5m, 1h, 1d) ======
function parseTime(str) {
  const match = str.match(/(\d+)(s|m|h|d)/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s": return num * 1000;
    case "m": return num * 60000;
    case "h": return num * 3600000;
    case "d": return num * 86400000;
    default: return null;
  }
}

// ====== Xử lý lệnh ======
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Lệnh test bot
  if (message.content === "!ping") {
    return message.reply("🏓 Pong! Bot đang hoạt động.");
  }

  // Lệnh tạo giveaway
  if (message.content.startsWith("!ga")) {
    const args = message.content.split(" ");
    const duration = parseTime(args[1]);
    const winnerCount = parseInt(args[2]);
    const prize = args.slice(3).join(" ");

    if (!duration || isNaN(winnerCount) || !prize) {
      return message.reply("❌ Sai cú pháp!\nVí dụ: `!ga 10s 1 Nitro`");
    }

    const endTime = Date.now() + duration;
    const embed = {
      title: "🎉 GIVEAWAY ĐANG DIỄN RA 🎉",
      description: `💎 Phần thưởng: **${prize}**\n🏆 Số người thắng: **${winnerCount}**\n⏰ Thời gian: **${args[1]}**\n\n👉 React 🎉 để tham gia ngay!`,
      color: 0xffc107, // vàng nổi bật
      timestamp: new Date(endTime),
      footer: { text: "Giveaway kết thúc vào" },
    };

    const giveawayMsg = await message.channel.send({ embeds: [embed] });
    await giveawayMsg.react("🎉");

    giveaways.push({
      messageId: giveawayMsg.id,
      channelId: message.channel.id,
      prize,
      winnerCount,
      endTime,
    });
    saveGiveaways();

    // Hẹn giờ chọn winner
    setTimeout(async () => {
      try {
        const msg = await message.channel.messages.fetch(giveawayMsg.id);
        const reaction = msg.reactions.cache.get("🎉");
        const users = await reaction.users.fetch();
        const filtered = users.filter((u) => !u.bot);
        if (filtered.size === 0) {
          return message.channel.send(`❌ Không có ai tham gia giveaway **${prize}**`);
        }
        const winners = filtered.random(winnerCount);

        const winEmbed = {
          title: "🎊 GIVEAWAY KẾT THÚC 🎊",
          description: `💎 Phần thưởng: **${prize}**\n🏆 Người thắng: ${winners.map(w => `<@${w.id}>`).join(", ")}`,
          color: 0x2ecc71, // xanh lá
          timestamp: new Date(),
          footer: { text: "Chúc mừng người chiến thắng!" },
        };

        message.channel.send({ embeds: [winEmbed] });
      } catch (err) {
        console.error(err);
        message.channel.send("⚠️ Có lỗi xảy ra khi kết thúc giveaway!");
      }
    }, duration);
  }

  // Lệnh reroll
  if (message.content.startsWith("!reroll")) {
    const args = message.content.split(" ");
    const messageId = args[1];
    if (!messageId) return message.reply("❌ Bạn phải nhập ID tin nhắn giveaway để reroll!");

    const giveaway = giveaways.find((g) => g.messageId === messageId);
    if (!giveaway) return message.reply("❌ Không tìm thấy giveaway với ID này!");

    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      const msg = await channel.messages.fetch(messageId);
      const reaction = msg.reactions.cache.get("🎉");
      if (!reaction) return message.reply("❌ Giveaway này không có ai tham gia!");

      const users = await reaction.users.fetch();
      const filtered = users.filter((u) => !u.bot);
      if (filtered.size === 0) return message.reply("❌ Không có ai tham gia hợp lệ!");

      const winners = filtered.random(giveaway.winnerCount);
      const rerollEmbed = {
        title: "🔄 REROLL GIVEAWAY 🔄",
        description: `💎 Phần thưởng: **${giveaway.prize}**\n🏆 Người thắng mới: ${winners.map(w => `<@${w.id}>`).join(", ")}`,
        color: 0xe67e22, // cam
        timestamp: new Date(),
        footer: { text: "Người thắng mới đã được chọn" },
      };
      message.channel.send({ embeds: [rerollEmbed] });
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Có lỗi xảy ra khi reroll!");
    }
  }

  // Lệnh listga
  if (message.content === "!listga") {
    if (giveaways.length === 0) {
      return message.reply("📭 Hiện tại không có giveaway nào đang chạy.");
    }

    const now = Date.now();
    const list = giveaways.map(g => {
      const remaining = g.endTime - now;
      const seconds = Math.max(0, Math.floor(remaining / 1000));
      return `🎁 **${g.prize}** | 🏆 ${g.winnerCount} winner(s) | ⏳ còn ${seconds}s | 🆔 ${g.messageId}`;
    }).join("\n\n");

    const listEmbed = {
      title: "📋 Danh sách Giveaway đang chạy",
      description: list,
      color: 0x00ffcc,
      timestamp: new Date(),
    };

    message.channel.send({ embeds: [listEmbed] });
  }
});

// ====== Login bot ======
client.login(process.env.DISCORD_TOKEN);
