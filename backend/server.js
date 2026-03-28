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
  deals: [],
  activations: [],
  users: [],
});

async function initDB() {
  await db.read();
  db.data ||= { deals: [], activations: [], users: [] };
  await db.write();
}

function makeId() {
  return crypto.randomUUID();
}

app.get("/api/deals", async (req, res) => {
  await db.read();

  const now = new Date();

  const activeDeals = db.data.deals.filter((deal) => {
    if (!deal.expirationDate) return true;
    return new Date(deal.expirationDate) > now;
  });

  res.json(activeDeals);
});

app.post("/api/deals", async (req, res) => {
  await db.read();

  const newDeal = {
    _id: makeId(),
    title: req.body.title || "",
    store: req.body.store || "",
    price: Number(req.body.price) || 0,
    oldPrice: Number(req.body.oldPrice) || 0,
    image: req.body.image || "",
    views: 0,
    remainingQuantity: Number(req.body.remainingQuantity) || 0,
    expirationDate: req.body.expirationDate || null,
    createdAt: new Date().toISOString(),
  };

  db.data.deals.push(newDeal);
  await db.write();

  res.json(newDeal);
});

app.post("/api/deals/:id/view", async (req, res) => {
  await db.read();

  const deal = db.data.deals.find((d) => d._id === req.params.id);

  if (!deal) {
    return res.status(404).json({ error: "Deal not found" });
  }

  deal.views += 1;
  await db.write();

  res.json({ success: true, views: deal.views });
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

  res.json({
    success: true,
    activation,
  });
});

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

app.post("/api/activate", async (req, res) => {
  await db.read();

  const { dealId, telegramId } = req.body;

  const deal = db.data.deals.find((d) => d._id === dealId);

  if (!deal) {
    return res.status(404).json({ error: "Deal not found" });
  }

  if (!telegramId) {
    return res.status(400).json({ error: "Telegram user is required" });
  }

  const alreadyActivated = db.data.activations.find(
    (a) => a.dealId === dealId && String(a.telegramId) === String(telegramId),
  );

  if (alreadyActivated) {
    return res.status(400).json({ error: "You already activated this deal" });
  }

  if (deal.remainingQuantity <= 0) {
    return res.status(400).json({ error: "Sold out" });
  }

  deal.remainingQuantity -= 1;

  const activation = {
    _id: makeId(),
    dealId,
    telegramId,
    activatedAt: new Date().toISOString(),
    redeemed: false,
  };

  db.data.activations.push(activation);
  await db.write();

  const qrPayload = JSON.stringify({
    activationId: activation._id,
    dealId: deal._id,
    telegramId,
  });

  const qr = await QRCode.toDataURL(qrPayload);

  res.json({
    success: true,
    qr,
    activation,
    remainingQuantity: deal.remainingQuantity,
  });
});

app.get("/api/activations", async (req, res) => {
  await db.read();
  res.json(db.data.activations);
});

initDB().then(() => {
  app.listen(5000, () => {
    console.log("API running on http://localhost:5000");
  });
});
app.put("/api/deals/:id", async (req, res) => {
  await db.read();

  const deal = db.data.deals.find((d) => d._id === req.params.id);

  if (!deal) {
    return res.status(404).json({ error: "Deal not found" });
  }

  deal.title = req.body.title ?? deal.title;
  deal.store = req.body.store ?? deal.store;
  deal.price =
    req.body.price !== undefined ? Number(req.body.price) : deal.price;
  deal.oldPrice =
    req.body.oldPrice !== undefined ? Number(req.body.oldPrice) : deal.oldPrice;
  deal.image = req.body.image ?? deal.image;
  deal.remainingQuantity =
    req.body.remainingQuantity !== undefined
      ? Number(req.body.remainingQuantity)
      : deal.remainingQuantity;
  deal.expirationDate = req.body.expirationDate ?? deal.expirationDate;

  await db.write();
  res.json(deal);
});

app.delete("/api/deals/:id", async (req, res) => {
  await db.read();

  const index = db.data.deals.findIndex((d) => d._id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Deal not found" });
  }

  const deleted = db.data.deals.splice(index, 1)[0];
  await db.write();

  res.json({ success: true, deleted });
});

const PORT = process.env.PORT || 10000;

initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API running on port ${PORT}`);
  });
});
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
