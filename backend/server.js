const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { mapStore, mapProduct, mapUser } = require("./lib/mappers");
const {
  makeId,
  isFutureOrNull,
  getApiKey,
  getBearerToken,
  getAdminActorId,
} = require("./lib/utils");
const { createAuditLogger } = require("./lib/audit");
const { createMerchantAuth } = require("./lib/merchantAuth");
const { createTelegramApi } = require("./lib/telegram");
const { createRequireAdmin } = require("./middleware/auth");
const { requestLogger } = require("./middleware/requestLogger");
const { registerCatalogRoutes } = require("./routes/catalog");
const { registerActivationRoutes } = require("./routes/activations");
const { registerAdminRoutes } = require("./routes/admin");
const { registerTelegramRoutes } = require("./routes/telegram");

const app = express();
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !CORS_ORIGINS.length || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
  }),
);
app.use(express.json());
app.use(requestLogger);

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
const MERCHANT_API_KEY = process.env.MERCHANT_API_KEY || "";
const MERCHANT_TOKEN_SECRET =
  process.env.MERCHANT_TOKEN_SECRET || MERCHANT_API_KEY || "baraka-merchant";
const BOT_TOKEN = process.env.BOT_TOKEN || "";

const writeAuditLog = createAuditLogger({ pool, makeId });
const {
  hashMerchantPassword,
  signMerchantToken,
  requireMerchant,
} = createMerchantAuth({
  merchantApiKey: MERCHANT_API_KEY,
  merchantTokenSecret: MERCHANT_TOKEN_SECRET,
  getApiKey,
  getBearerToken,
});
const telegramApi = createTelegramApi(BOT_TOKEN);
const requireAdmin = createRequireAdmin({
  adminApiKey: ADMIN_API_KEY,
  getApiKey,
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");

    res.json({
      ok: true,
      service: "baraka-backend",
      database: "up",
      timestamp: new Date().toISOString(),
      env: {
        adminApiKeyConfigured: Boolean(ADMIN_API_KEY),
        merchantApiKeyConfigured: Boolean(MERCHANT_API_KEY),
        merchantTokenSecretConfigured: Boolean(MERCHANT_TOKEN_SECRET),
        botTokenConfigured: Boolean(BOT_TOKEN),
        corsOriginsConfigured: CORS_ORIGINS.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: "baraka-backend",
      database: "down",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

registerCatalogRoutes(app, {
  pool,
  requireAdmin,
  mapStore,
  mapProduct,
  writeAuditLog,
  makeId,
  getAdminActorId,
});

registerActivationRoutes(app, {
  pool,
  requireMerchant,
  mapStore,
  mapProduct,
  mapUser,
  writeAuditLog,
  makeId,
  isFutureOrNull,
});

registerAdminRoutes(app, {
  pool,
  requireAdmin,
  writeAuditLog,
  hashMerchantPassword,
  signMerchantToken,
  makeId,
  getAdminActorId,
});

registerTelegramRoutes(app, {
  pool,
  telegramApi,
  requireAdmin,
  makeId,
  mapUser,
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});
