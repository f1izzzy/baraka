function createTelegramApi(botToken) {
  return async function telegramApi(method, body) {
    if (!botToken) {
      throw new Error("BOT_TOKEN is not configured");
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.description || `Telegram API ${method} failed`);
    }

    return data.result;
  };
}

module.exports = {
  createTelegramApi,
};
