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
  };
  await db.write();
}

function isActive(product) {
  if (!product.expirationDate) return true;
  return new Date(product.expirationDate) > new Date();
}

/* ---------------- USERS ---------------- */

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

/* ---------------- STORES ---------------- */

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

  const products = db.data.products.filter(
    (p) => p.storeId === store._id && isActive(p),
  );

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
  db.data.products = db.data.products.filter(
    (p) => p.storeId !== deletedStore._id,
  );

  await db.write();

  res.json({
    success: true,
    deletedStore,
  });
});

/* ---------------- PRODUCTS ---------------- */

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

/* ---------------- ACTIVATION ---------------- */

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

app.post("/api/redeem", async (req, res) => {
  await db.read();

  const { activationId } = req.body;

  const activation = db.data.activations.find((a) => a._id === activationId);

  if (!activation) {
    return res.status(404).json({ error: "Activation not found" });
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
