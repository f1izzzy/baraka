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
app.use(cors());
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
