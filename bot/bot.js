const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Open Baraka", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open Baraka",
            web_app: {
              url: "https://baraka-miniapp.vercel.app",
            },
          },
        ],
      ],
    },
  });
});
