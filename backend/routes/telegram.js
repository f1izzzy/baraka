const crypto = require("crypto");

function registerTelegramRoutes(app, deps) {
  const { pool, telegramApi, requireAdmin, makeId, mapUser } = deps;

  app.post("/api/bot/webhook", async (req, res) => {
    try {
      const message = req.body?.message;
      const text = message?.text || "";
      const chatId = message?.chat?.id;

      if (chatId && text.startsWith("/start")) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: "Open Baraka",
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
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("bot webhook error:", err);
      res.status(500).json({ error: "Webhook failed" });
    }
  });

  app.post("/api/admin/bot/set-webhook", requireAdmin, async (req, res) => {
    try {
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;

      if (!webhookBaseUrl) {
        return res
          .status(500)
          .json({ error: "WEBHOOK_BASE_URL is not configured" });
      }

      const cleanedBaseUrl = webhookBaseUrl.replace(/\/+$/, "");
      const webhookUrl = `${cleanedBaseUrl}/api/bot/webhook`;

      await telegramApi("setWebhook", {
        url: webhookUrl,
        drop_pending_updates: true,
      });

      res.json({
        success: true,
        webhookUrl,
      });
    } catch (err) {
      console.error("set webhook error:", err);
      res.status(500).json({ error: "Failed to set Telegram webhook" });
    }
  });

  app.post("/api/auth/telegram", async (req, res) => {
    try {
      const { initData } = req.body;

      if (!initData) {
        return res.status(400).json({ error: "No initData" });
      }

      const botToken = process.env.BOT_TOKEN;
      if (!botToken) {
        return res.status(500).json({ error: "BOT_TOKEN is not configured" });
      }

      const parsed = new URLSearchParams(initData);
      const hash = parsed.get("hash");

      if (!hash) {
        return res.status(400).json({ error: "Missing hash" });
      }

      parsed.delete("hash");

      const dataCheckString = [...parsed.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

      const secretKey = crypto
        .createHmac("sha256", "WebAppData")
        .update(botToken)
        .digest();

      const hmac = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

      if (hmac !== hash) {
        return res.status(403).json({ error: "Invalid Telegram data" });
      }

      const userRaw = parsed.get("user");
      if (!userRaw) {
        return res.status(400).json({ error: "Missing user data" });
      }

      const userData = JSON.parse(userRaw);

      const existing = await pool.query(
        `select * from users where telegram_id = $1 limit 1`,
        [String(userData.id)],
      );

      let user;

      if (!existing.rows.length) {
        const inserted = await pool.query(
          `
          insert into users (id, telegram_id, first_name, username)
          values ($1, $2, $3, $4)
          returning *
          `,
          [
            makeId(),
            String(userData.id),
            userData.first_name || "",
            userData.username || "",
          ],
        );
        user = inserted.rows[0];
      } else {
        const updated = await pool.query(
          `
          update users
          set first_name = $2, username = $3
          where telegram_id = $1
          returning *
          `,
          [
            String(userData.id),
            userData.first_name || "",
            userData.username || "",
          ],
        );
        user = updated.rows[0];
      }

      res.json({
        success: true,
        user: mapUser(user),
      });
    } catch (err) {
      console.error("Telegram auth error:", err);
      res.status(500).json({ error: "Auth failed" });
    }
  });
}

module.exports = {
  registerTelegramRoutes,
};
