const TelegramBot = require("node-telegram-bot-api");

const token = "8015149560:AAHmPCl3xzcM_y01ipuoRdCPlNT4ySXsiNs";

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Open Baraka", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open Baraka",
            web_app: {
              url: "https://your-miniapp-url.com",
            },
          },
        ],
      ],
    },
  });
});
