const { Client, GatewayIntentBits, Partials, EmbedBuilder, Events, REST, Routes } = require("discord.js");
const fs = require("fs");
const ms = require("ms");

require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const GIVEAWAY_FILE = "giveaways.json";
let giveaways = [];

// Load dữ liệu
if (fs.existsSync(GIVEAWAY_FILE)) {
  giveaways = JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
}

// Lưu lại file
function saveGiveaways() {
  fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(giveaways, null, 2));
}

// Danh sách slash command
const commands = [
  {
    name: "ga",
    description: "Tạo giveaway mới",
    options: [
      { name: "thoi_gian", description: "Thời gian (vd: 10m, 1h, 1d)", type: 3, required: true },
      { name: "giai_thuong", description: "Phần thưởng", type: 3, required: true },
      { name: "so_nguoi_thang", description: "Số người thắng", type: 4, required: true }
    ]
  },
  {
    name: "end",
    description: "Kết thúc giveaway",
    options: [{ name: "id", description: "ID tin nhắn giveaway", type: 3, required: true }]
  },
  {
    name: "reroll",
    description: "Quay lại giveaway",
    options: [{ name: "id", description: "ID tin nhắn giveaway", type: 3, required: true }]
  },
  { name: "ping", description: "Kiểm tra ping bot" },
  { name: "uptime", description: "Xem thời gian bot online" }
];

// Đăng ký slash command khi bot on
client.once("ready", async () => {
  console.log(`✅ Bot đang chạy với tên: ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("📌 Slash commands đã đăng ký!");
  } catch (err) {
    console.error("❌ Lỗi đăng ký lệnh:", err);
  }

  // Check giveaway mỗi 5s
  setInterval(() => {
    giveaways.forEach(async (g) => {
      if (Date.now() >= g.endAt && !g.ended) {
        try {
          const channel = await client.channels.fetch(g.channelId);
          const message = await channel.messages.fetch(g.messageId);
          const reaction = message.reactions.cache.get("🎉");
          const users = reaction ? await reaction.users.fetch() : [];

          const participants = users.filter(u => !u.bot).map(u => u.id);
          if (participants.length < g.winnerCount) {
            channel.send(`❌ Giveaway cho **${g.prize}** đã kết thúc! Không đủ người tham gia.`);
          } else {
            const winners = [];
            for (let j = 0; j < g.winnerCount; j++) {
              const winner = participants[Math.floor(Math.random() * participants.length)];
              winners.push(`<@${winner}>`);
            }
            channel.send(`🎉 Chúc mừng ${winners.join(", ")} đã thắng **${g.prize}**!`);
          }
          g.ended = true;
          saveGiveaways();
        } catch (e) {
          console.error("❌ Lỗi kết thúc giveaway:", e);
        }
      }
    });
  }, 5000);
});

// Xử lý slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "ga") {
    const time = ms(interaction.options.getString("thoi_gian"));
    const prize = interaction.options.getString("giai_thuong");
    const winnerCount = interaction.options.getInteger("so_nguoi_thang");

    if (!time) return interaction.reply({ content: "❌ Thời gian không hợp lệ!", ephemeral: true });

    const endDate = new Date(Date.now() + time);

    const embed = new EmbedBuilder()
      .setTitle("🎉 GIVEAWAY 🎉")
      .setDescription(`Bấm 🎉 để tham gia!\n\n🎁 Giải thưởng: **${prize}**\n👑 Số người thắng: **${winnerCount}**\n🕒 Thời gian: **${ms(time, { long: true })}**\n📅 Kết thúc: <t:${Math.floor(endDate.getTime() / 1000)}:F>`)
      .setColor("Pink")
      .setFooter({ text: `Tạo bởi ${interaction.user.tag}` });

    const msg = await interaction.channel.send({ embeds: [embed] });
    await msg.react("🎉");

    giveaways.push({
      messageId: msg.id,
      channelId: msg.channel.id,
      prize,
      winnerCount,
      endAt: endDate.getTime(),
      ended: false
    });
    saveGiveaways();

    interaction.reply({ content: "✅ Giveaway đã tạo!", ephemeral: true });
  }

  if (commandName === "end") {
    const id = interaction.options.getString("id");
    const g = giveaways.find(g => g.messageId === id);
    if (!g) return interaction.reply("❌ Không tìm thấy giveaway.");
    g.endAt = Date.now();
    g.ended = false;
    saveGiveaways();
    interaction.reply("⏹ Giveaway sẽ kết thúc ngay!");
  }

  if (commandName === "reroll") {
    const id = interaction.options.getString("id");
    const g = giveaways.find(g => g.messageId === id);
    if (!g) return interaction.reply("❌ Không tìm thấy giveaway.");

    try {
      const channel = await client.channels.fetch(g.channelId);
      const message = await channel.messages.fetch(g.messageId);
      const reaction = message.reactions.cache.get("🎉");
      const users = reaction ? await reaction.users.fetch() : [];
      const participants = users.filter(u => !u.bot).map(u => u.id);

      if (participants.length < g.winnerCount) {
        interaction.reply("❌ Không đủ người để reroll.");
      } else {
        const winners = [];
        for (let j = 0; j < g.winnerCount; j++) {
          const winner = participants[Math.floor(Math.random() * participants.length)];
          winners.push(`<@${winner}>`);
        }
        interaction.reply(`🔄 Quay lại! Người thắng mới: ${winners.join(", ")}`);
      }
    } catch (e) {
      interaction.reply("❌ Lỗi reroll.");
    }
  }

  if (commandName === "ping") {
    interaction.reply(`🏓 Ping: **${client.ws.ping}ms**`);
  }

  if (commandName === "uptime") {
    let totalSeconds = Math.floor(process.uptime());
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    interaction.reply(`⏱ Bot đã chạy: **${hours}h ${minutes}m ${seconds}s**`);
  }
});

client.login(process.env.TOKEN);
