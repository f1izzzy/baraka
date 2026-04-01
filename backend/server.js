const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const file = path.join(__dirname, "db.json");
const adapter = new JSONFile(file);
const db = new Low(adapter, {
  stores: [],
  products: [],
  activations: [],
  users: [],
  favorites: [],
});

function makeId() {
  return crypto.randomUUID();
}

async function initDB() {
  await db.read();
  db.data ||= {
    stores: [],
    products: [],
    activations: [],
    users: [],
    favorites: [],
  };
  await db.write();
}

function isActive(product) {
  if (!product.expirationDate) return true;
  return new Date(product.expirationDate) > new Date();
}

/* USERS */

app.post("/api/users/login", async (req, res) => {
  await db.read();

  const { telegramId, firstName, username } = req.body;

  if (!telegramId) {
    return res.status(400).json({ error: "telegramId is required" });
  }

  let user = db.data.users.find(
    (u) => String(u.telegramId) === String(telegramId),
  );

  if (!user) {
    user = {
      _id: makeId(),
      telegramId,
      firstName: firstName || "",
      username: username || "",
      createdAt: new Date().toISOString(),
    };

    db.data.users.push(user);
    await db.write();
  }

  res.json(user);
});

/* STORES */

app.get("/api/stores", async (req, res) => {
  await db.read();

  const stores = db.data.stores.map((store) => {
    const products = db.data.products.filter(
      (p) => p.storeId === store._id && isActive(p),
    );

    return {
      ...store,
      productCount: products.length,
    };
  });

  res.json(stores);
});

app.get("/api/stores/:id", async (req, res) => {
  await db.read();

  const store = db.data.stores.find((s) => s._id === req.params.id);

  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  let products = db.data.products.filter(
    (p) => p.storeId === store._id && isActive(p),
  );

  const { category } = req.query;
  if (category && category !== "All") {
    products = products.filter((p) => p.category === category);
  }

  res.json({
    store,
    products,
  });
});

app.post("/api/stores", async (req, res) => {
  await db.read();

  const newStore = {
    _id: makeId(),
    name: req.body.name || "",
    description: req.body.description || "",
    location: req.body.location || "",
    address: req.body.address || "",
    coverImage: req.body.coverImage || "",
    logo: req.body.logo || "",
    createdAt: new Date().toISOString(),
  };

  db.data.stores.push(newStore);
  await db.write();

  res.json(newStore);
});

app.put("/api/stores/:id", async (req, res) => {
  await db.read();

  const store = db.data.stores.find((s) => s._id === req.params.id);

  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  store.name = req.body.name ?? store.name;
  store.description = req.body.description ?? store.description;
  store.location = req.body.location ?? store.location;
  store.address = req.body.address ?? store.address;
  store.coverImage = req.body.coverImage ?? store.coverImage;
  store.logo = req.body.logo ?? store.logo;

  await db.write();
  res.json(store);
});

app.delete("/api/stores/:id", async (req, res) => {
  await db.read();

  const storeIndex = db.data.stores.findIndex((s) => s._id === req.params.id);

  if (storeIndex === -1) {
    return res.status(404).json({ error: "Store not found" });
  }

  const deletedStore = db.data.stores.splice(storeIndex, 1)[0];
  const deletedProductIds = db.data.products
    .filter((p) => p.storeId === deletedStore._id)
    .map((p) => p._id);

  db.data.products = db.data.products.filter(
    (p) => p.storeId !== deletedStore._id,
  );

  db.data.favorites = db.data.favorites.filter(
    (f) => !deletedProductIds.includes(f.productId),
  );

  await db.write();

  res.json({
    success: true,
    deletedStore,
  });
});

/* PRODUCTS */

app.post("/api/products", async (req, res) => {
  await db.read();

  const store = db.data.stores.find((s) => s._id === req.body.storeId);

  if (!store) {
    return res.status(400).json({ error: "Store not found" });
  }

  const sizes =
    typeof req.body.sizes === "string"
      ? req.body.sizes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : Array.isArray(req.body.sizes)
        ? req.body.sizes
        : [];

  const newProduct = {
    _id: makeId(),
    storeId: req.body.storeId,
    title: req.body.title || "",
    description: req.body.description || "",
    category: req.body.category || "Other",
    price: Number(req.body.price) || 0,
    oldPrice: Number(req.body.oldPrice) || 0,
    image: req.body.image || "",
    sizes,
    remainingQuantity: Number(req.body.remainingQuantity) || 0,
    views: 0,
    expirationDate: req.body.expirationDate || null,
    createdAt: new Date().toISOString(),
  };

  db.data.products.push(newProduct);
  await db.write();

  res.json(newProduct);
});

app.put("/api/products/:id", async (req, res) => {
  await db.read();

  const product = db.data.products.find((p) => p._id === req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (req.body.title !== undefined) product.title = req.body.title;
  if (req.body.description !== undefined)
    product.description = req.body.description;
  if (req.body.category !== undefined) product.category = req.body.category;
  if (req.body.price !== undefined) product.price = Number(req.body.price);
  if (req.body.oldPrice !== undefined)
    product.oldPrice = Number(req.body.oldPrice);
  if (req.body.image !== undefined) product.image = req.body.image;
  if (req.body.remainingQuantity !== undefined) {
    product.remainingQuantity = Number(req.body.remainingQuantity);
  }
  if (req.body.expirationDate !== undefined) {
    product.expirationDate = req.body.expirationDate;
  }
  if (req.body.sizes !== undefined) {
    product.sizes =
      typeof req.body.sizes === "string"
        ? req.body.sizes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : req.body.sizes;
  }

  await db.write();
  res.json(product);
});

app.delete("/api/products/:id", async (req, res) => {
  await db.read();

  const index = db.data.products.findIndex((p) => p._id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  const deleted = db.data.products.splice(index, 1)[0];
  db.data.favorites = db.data.favorites.filter(
    (f) => f.productId !== deleted._id,
  );

  await db.write();

  res.json({
    success: true,
    deleted,
  });
});

app.post("/api/products/:id/view", async (req, res) => {
  await db.read();

  const product = db.data.products.find((p) => p._id === req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  product.views += 1;
  await db.write();

  res.json({
    success: true,
    views: product.views,
  });
});

/* FAVORITES */

app.get("/api/favorites/:telegramId", async (req, res) => {
  await db.read();

  const { telegramId } = req.params;

  const favoriteRows = db.data.favorites.filter(
    (f) => String(f.telegramId) === String(telegramId),
  );

  const products = favoriteRows
    .map((fav) => db.data.products.find((p) => p._id === fav.productId))
    .filter(Boolean)
    .filter(isActive);

  res.json(products);
});

app.post("/api/favorites/toggle", async (req, res) => {
  await db.read();

  const { telegramId, productId } = req.body;

  if (!telegramId || !productId) {
    return res
      .status(400)
      .json({ error: "telegramId and productId are required" });
  }

  const existingIndex = db.data.favorites.findIndex(
    (f) =>
      String(f.telegramId) === String(telegramId) &&
      String(f.productId) === String(productId),
  );

  if (existingIndex !== -1) {
    db.data.favorites.splice(existingIndex, 1);
    await db.write();
    return res.json({ success: true, isFavorite: false });
  }

  db.data.favorites.push({
    _id: makeId(),
    telegramId,
    productId,
    createdAt: new Date().toISOString(),
  });

  await db.write();

  res.json({ success: true, isFavorite: true });
});

/* ACTIVATIONS */

app.post("/api/activate", async (req, res) => {
  await db.read();

  const { productId, telegramId } = req.body;

  const product = db.data.products.find((p) => p._id === productId);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (!telegramId) {
    return res.status(400).json({ error: "Telegram user is required" });
  }

  const alreadyActivated = db.data.activations.find(
    (a) =>
      a.productId === productId && String(a.telegramId) === String(telegramId),
  );

  if (alreadyActivated) {
    return res
      .status(400)
      .json({ error: "You already activated this product" });
  }

  if (product.remainingQuantity <= 0) {
    return res.status(400).json({ error: "Sold out" });
  }

  product.remainingQuantity -= 1;

  const activation = {
    _id: makeId(),
    productId,
    telegramId,
    activatedAt: new Date().toISOString(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    redeemed: false,
  };

  db.data.activations.push(activation);
  await db.write();

  const qrPayload = JSON.stringify({
    activationId: activation._id,
    productId: product._id,
    telegramId,
  });

  const qr = await QRCode.toDataURL(qrPayload);

  res.json({
    success: true,
    qr,
    qrPayload,
    activation,
    remainingQuantity: product.remainingQuantity,
  });
});

app.get("/api/my-deals/:telegramId", async (req, res) => {
  await db.read();

  const { telegramId } = req.params;

  const userActivations = db.data.activations
    .filter((a) => String(a.telegramId) === String(telegramId))
    .map((a) => {
      const product = db.data.products.find((p) => p._id === a.productId);
      const store = product
        ? db.data.stores.find((s) => s._id === product.storeId)
        : null;

      return {
        ...a,
        product,
        store,
      };
    })
    .filter((item) => item.product);

  res.json(userActivations);
});

app.post("/api/redeem", async (req, res) => {
  await db.read();

  const { activationId } = req.body;

  const activation = db.data.activations.find((a) => a._id === activationId);

  if (!activation) {
    return res.status(404).json({ error: "Activation not found" });
  }

  if (Date.now() > activation.expiresAt) {
    return res.status(400).json({ error: "QR expired" });
  }

  if (activation.redeemed) {
    return res.status(400).json({ error: "QR already used" });
  }

  activation.redeemed = true;
  activation.redeemedAt = new Date().toISOString();

  await db.write();

  const product = db.data.products.find((p) => p._id === activation.productId);

  res.json({
    success: true,
    activation,
    product,
  });
});

app.get("/api/activations", async (req, res) => {
  await db.read();
  res.json(db.data.activations);
});

const PORT = process.env.PORT || 5000;

initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API running on port ${PORT}`);
  });
});

// TELEGRAM AUTH
app.post("/api/auth/telegram", async (req, res) => {
  try {
    await db.read();

    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ error: "No initData" });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
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
      .update(BOT_TOKEN)
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

    let user = db.data.users.find(
      (u) => String(u.telegramId) === String(userData.id),
    );

    if (!user) {
      user = {
        _id: makeId(),
        telegramId: userData.id,
        firstName: userData.first_name || "",
        username: userData.username || "",
        createdAt: new Date().toISOString(),
      };

      db.data.users.push(user);
    } else {
      user.firstName = userData.first_name || user.firstName || "";
      user.username = userData.username || user.username || "";
    }

    await db.write();

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("Telegram auth error:", err);
    res.status(500).json({ error: "Auth failed" });
  }
});

const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN not found");
} else {
  const bot = new TelegramBot(BOT_TOKEN, { polling: true });

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

  console.log("🤖 Bot started");
}
