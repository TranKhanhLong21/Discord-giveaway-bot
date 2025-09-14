const { Client, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const prefix = "!";
let giveaways = [];

if (fs.existsSync("giveaways.json")) {
  giveaways = JSON.parse(fs.readFileSync("giveaways.json"));
}

function saveGiveaways() {
  fs.writeFileSync("giveaways.json", JSON.stringify(giveaways, null, 2));
}

// ✅ emoji động (animated) bạn có thể đổi bằng emoji custom trong server
const EMOJI_JOIN = "<a:party:123456789012345678>"; // thay ID bằng emoji server bạn

client.on("ready", () => {
  console.log(`✅ Bot đã online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

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

client.login(process.env.TOKEN);
