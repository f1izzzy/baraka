const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const crypto = require("crypto");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
const MERCHANT_API_KEY = process.env.MERCHANT_API_KEY || "";
const MERCHANT_TOKEN_SECRET =
  process.env.MERCHANT_TOKEN_SECRET || MERCHANT_API_KEY || "baraka-merchant";

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`,
    );
  });

  next();
});

function makeId() {
  return crypto.randomUUID();
}

function hashMerchantPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function signMerchantToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", MERCHANT_TOKEN_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyMerchantToken(token) {
  if (!token || !token.includes(".")) return null;

  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", MERCHANT_TOKEN_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    if (!payload?.merchantAccountId || !payload?.storeId || !payload?.login) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function writeAuditLog({
  actorType,
  actorId = "",
  action,
  entityType,
  entityId = "",
  metadata = {},
}) {
  try {
    await pool.query(
      `
      insert into audit_logs (
        id, actor_type, actor_id, action, entity_type, entity_id, metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        makeId(),
        actorType,
        String(actorId || ""),
        action,
        entityType,
        String(entityId || ""),
        JSON.stringify(metadata || {}),
      ],
    );
  } catch (err) {
    console.error("audit log write error:", err.message);
  }
}

function mapStore(row) {
  return {
    _id: row.id,
    name: row.name,
    description: row.description,
    location: row.location,
    address: row.address,
    coverImage: row.cover_image,
    logo: row.logo,
    createdAt: row.created_at,
  };
}

function mapProduct(row) {
  return {
    _id: row.id,
    storeId: row.store_id,
    title: row.title,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    oldPrice: Number(row.old_price),
    image: row.image,
    sizes: row.sizes || [],
    remainingQuantity: row.remaining_quantity,
    views: row.views,
    expirationDate: row.expiration_date,
    createdAt: row.created_at,
  };
}

function mapUser(row) {
  return {
    _id: row.id,
    telegramId: row.telegram_id,
    firstName: row.first_name,
    username: row.username,
    createdAt: row.created_at,
  };
}

function isFutureOrNull(date) {
  if (!date) return true;
  return new Date(date) > new Date();
}

function getApiKey(req) {
  return req.headers["x-api-key"] || "";
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
}

function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(500).json({ error: "ADMIN_API_KEY is not configured" });
  }

  if (getApiKey(req) !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Admin access denied" });
  }

  next();
}

function requireMerchant(req, res, next) {
  const merchantToken = getBearerToken(req);
  const merchantSession = verifyMerchantToken(merchantToken);

  if (merchantSession) {
    req.merchant = merchantSession;
    return next();
  }

  if (!MERCHANT_API_KEY) {
    return res
      .status(500)
      .json({ error: "MERCHANT_API_KEY is not configured" });
  }

  if (getApiKey(req) !== MERCHANT_API_KEY) {
    return res.status(401).json({ error: "Merchant access denied" });
  }

  next();
}

function getAdminActorId() {
  return "admin-api-key";
}

/* USERS */

app.post("/api/users/login", async (req, res) => {
  try {
    const { telegramId, firstName, username } = req.body;

    if (!telegramId) {
      return res.status(400).json({ error: "telegramId is required" });
    }

    const existing = await pool.query(
      `select * from users where telegram_id = $1 limit 1`,
      [String(telegramId)],
    );

    if (existing.rows.length) {
      return res.json(mapUser(existing.rows[0]));
    }

    const inserted = await pool.query(
      `
      insert into users (id, telegram_id, first_name, username)
      values ($1, $2, $3, $4)
      returning *
      `,
      [makeId(), String(telegramId), firstName || "", username || ""],
    );

    res.json(mapUser(inserted.rows[0]));
  } catch (err) {
    console.error("users/login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* STORES */

app.get("/api/stores", async (req, res) => {
  try {
    const result = await pool.query(`
      select
        s.*,
        count(p.id) filter (
          where p.expiration_date is null or p.expiration_date > now()
        ) as product_count
      from stores s
      left join products p on p.store_id = s.id
      group by s.id
      order by s.created_at desc
    `);

    const stores = result.rows.map((row) => ({
      ...mapStore(row),
      productCount: Number(row.product_count || 0),
    }));

    res.json(stores);
  } catch (err) {
    console.error("get stores error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/stores/:id", async (req, res) => {
  try {
    const storeRes = await pool.query(
      `select * from stores where id = $1 limit 1`,
      [req.params.id],
    );

    if (!storeRes.rows.length) {
      return res.status(404).json({ error: "Store not found" });
    }

    let query = `
      select * from products
      where store_id = $1
        and (expiration_date is null or expiration_date > now())
      order by created_at desc
    `;
    let params = [req.params.id];

    const { category } = req.query;
    if (category && category !== "All") {
      query = `
        select * from products
        where store_id = $1
          and category = $2
          and (expiration_date is null or expiration_date > now())
        order by created_at desc
      `;
      params = [req.params.id, category];
    }

    const productsRes = await pool.query(query, params);

    res.json({
      store: mapStore(storeRes.rows[0]),
      products: productsRes.rows.map(mapProduct),
    });
  } catch (err) {
    console.error("get store by id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/stores", requireAdmin, async (req, res) => {
  try {
    const storeId = makeId();
    const inserted = await pool.query(
      `
      insert into stores (
        id, name, description, location, address, cover_image, logo
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning *
      `,
      [
        storeId,
        req.body.name || "",
        req.body.description || "",
        req.body.location || "",
        req.body.address || "",
        req.body.coverImage || "",
        req.body.logo || "",
      ],
    );

    await writeAuditLog({
      actorType: "admin",
      actorId: getAdminActorId(),
      action: "store_created",
      entityType: "store",
      entityId: storeId,
      metadata: {
        name: req.body.name || "",
        location: req.body.location || "",
      },
    });

    res.json(mapStore(inserted.rows[0]));
  } catch (err) {
    console.error("create store error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/stores/:id", requireAdmin, async (req, res) => {
  try {
    const updated = await pool.query(
      `
      update stores
      set
        name = coalesce($2, name),
        description = coalesce($3, description),
        location = coalesce($4, location),
        address = coalesce($5, address),
        cover_image = coalesce($6, cover_image),
        logo = coalesce($7, logo)
      where id = $1
      returning *
      `,
      [
        req.params.id,
        req.body.name,
        req.body.description,
        req.body.location,
        req.body.address,
        req.body.coverImage,
        req.body.logo,
      ],
    );

    if (!updated.rows.length) {
      return res.status(404).json({ error: "Store not found" });
    }

    await writeAuditLog({
      actorType: "admin",
      actorId: getAdminActorId(),
      action: "store_updated",
      entityType: "store",
      entityId: req.params.id,
      metadata: {
        name: updated.rows[0].name,
        location: updated.rows[0].location,
      },
    });

    res.json(mapStore(updated.rows[0]));
  } catch (err) {
    console.error("update store error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/stores/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await pool.query(
      `delete from stores where id = $1 returning *`,
      [req.params.id],
    );

    if (!deleted.rows.length) {
      return res.status(404).json({ error: "Store not found" });
    }

    await writeAuditLog({
      actorType: "admin",
      actorId: getAdminActorId(),
      action: "store_deleted",
      entityType: "store",
      entityId: req.params.id,
      metadata: {
        name: deleted.rows[0].name,
      },
    });

    res.json({
      success: true,
      deletedStore: mapStore(deleted.rows[0]),
    });
  } catch (err) {
    console.error("delete store error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* PRODUCTS */

app.post("/api/products", requireAdmin, async (req, res) => {
  try {
    const storeCheck = await pool.query(
      `select id from stores where id = $1 limit 1`,
      [req.body.storeId],
    );

    if (!storeCheck.rows.length) {
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

    const productId = makeId();
    const inserted = await pool.query(
      `
      insert into products (
        id, store_id, title, description, category, price, old_price, image,
        sizes, remaining_quantity, views, expiration_date
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      returning *
      `,
      [
        productId,
        req.body.storeId,
        req.body.title || "",
        req.body.description || "",
        req.body.category || "Other",
        Number(req.body.price) || 0,
        Number(req.body.oldPrice) || 0,
        req.body.image || "",
        sizes,
        Number(req.body.remainingQuantity) || 0,
        0,
        req.body.expirationDate || null,
      ],
    );

    await writeAuditLog({
      actorType: "admin",
      actorId: getAdminActorId(),
      action: "product_created",
      entityType: "product",
      entityId: productId,
      metadata: {
        storeId: req.body.storeId,
        title: req.body.title || "",
        price: Number(req.body.price) || 0,
      },
    });

    res.json(mapProduct(inserted.rows[0]));
  } catch (err) {
    console.error("create product error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const currentRes = await pool.query(
      `select * from products where id = $1 limit 1`,
      [req.params.id],
    );

    if (!currentRes.rows.length) {
      return res.status(404).json({ error: "Product not found" });
    }

    const current = currentRes.rows[0];

    const sizes =
      req.body.sizes !== undefined
        ? typeof req.body.sizes === "string"
          ? req.body.sizes
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : req.body.sizes
        : current.sizes;

    const updated = await pool.query(
      `
      update products
      set
        title = $2,
        description = $3,
        category = $4,
        price = $5,
        old_price = $6,
        image = $7,
        sizes = $8,
        remaining_quantity = $9,
        expiration_date = $10
      where id = $1
      returning *
      `,
      [
        req.params.id,
        req.body.title ?? current.title,
        req.body.description ?? current.description,
        req.body.category ?? current.category,
        req.body.price !== undefined ? Number(req.body.price) : current.price,
        req.body.oldPrice !== undefined
          ? Number(req.body.oldPrice)
          : current.old_price,
        req.body.image ?? current.image,
        sizes,
        req.body.remainingQuantity !== undefined
          ? Number(req.body.remainingQuantity)
          : current.remaining_quantity,
        req.body.expirationDate !== undefined
          ? req.body.expirationDate
          : current.expiration_date,
      ],
    );

    await writeAuditLog({
      actorType: "admin",
      actorId: getAdminActorId(),
      action: "product_updated",
      entityType: "product",
      entityId: req.params.id,
      metadata: {
        storeId: updated.rows[0].store_id,
        title: updated.rows[0].title,
        price: Number(updated.rows[0].price),
      },
    });

    res.json(mapProduct(updated.rows[0]));
  } catch (err) {
    console.error("update product error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await pool.query(
      `delete from products where id = $1 returning *`,
      [req.params.id],
    );

    if (!deleted.rows.length) {
      return res.status(404).json({ error: "Product not found" });
    }

    await writeAuditLog({
      actorType: "admin",
      actorId: getAdminActorId(),
      action: "product_deleted",
      entityType: "product",
      entityId: req.params.id,
      metadata: {
        storeId: deleted.rows[0].store_id,
        title: deleted.rows[0].title,
      },
    });

    res.json({
      success: true,
      deleted: mapProduct(deleted.rows[0]),
    });
  } catch (err) {
    console.error("delete product error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/products/:id/view", async (req, res) => {
  try {
    const updated = await pool.query(
      `
      update products
      set views = views + 1
      where id = $1
      returning views
      `,
      [req.params.id],
    );

    if (!updated.rows.length) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({
      success: true,
      views: updated.rows[0].views,
    });
  } catch (err) {
    console.error("product view error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* FAVORITES */

app.get("/api/favorites/:telegramId", async (req, res) => {
  try {
    const result = await pool.query(
      `
      select p.*
      from favorites f
      join products p on p.id = f.product_id
      where f.telegram_id = $1
        and (p.expiration_date is null or p.expiration_date > now())
      order by f.created_at desc
      `,
      [String(req.params.telegramId)],
    );

    res.json(result.rows.map(mapProduct));
  } catch (err) {
    console.error("get favorites error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/favorites/toggle", async (req, res) => {
  try {
    const { telegramId, productId } = req.body;

    if (!telegramId || !productId) {
      return res
        .status(400)
        .json({ error: "telegramId and productId are required" });
    }

    const existing = await pool.query(
      `
      select * from favorites
      where telegram_id = $1 and product_id = $2
      limit 1
      `,
      [String(telegramId), String(productId)],
    );

    if (existing.rows.length) {
      await pool.query(
        `delete from favorites where telegram_id = $1 and product_id = $2`,
        [String(telegramId), String(productId)],
      );
      return res.json({ success: true, isFavorite: false });
    }

    await pool.query(
      `
      insert into favorites (id, telegram_id, product_id)
      values ($1, $2, $3)
      `,
      [makeId(), String(telegramId), String(productId)],
    );

    res.json({ success: true, isFavorite: true });
  } catch (err) {
    console.error("toggle favorite error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* STORE ACTIVATION */

app.post("/api/activate-store", async (req, res) => {
  const client = await pool.connect();

  try {
    const { telegramId, storeId, productIds } = req.body;

    if (!telegramId || !storeId || !productIds?.length) {
      return res.status(400).json({ error: "Missing data" });
    }

    await client.query("begin");

    const productsRes = await client.query(
      `select * from products where id = any($1::text[])`,
      [productIds],
    );

    const products = productsRes.rows;

    if (!products.length) {
      await client.query("rollback");
      return res.status(404).json({ error: "Products not found" });
    }

    const invalid = products.find((p) => p.store_id !== storeId);
    if (invalid) {
      await client.query("rollback");
      return res.status(400).json({ error: "Products must be from one store" });
    }

    for (const p of products) {
      if (!isFutureOrNull(p.expiration_date)) {
        await client.query("rollback");
        return res.status(400).json({ error: `Product "${p.title}" expired` });
      }

      if (p.remaining_quantity <= 0) {
        await client.query("rollback");
        return res
          .status(400)
          .json({ error: `Product "${p.title}" is sold out` });
      }
    }

    for (const p of products) {
      await client.query(
        `
        update products
        set remaining_quantity = remaining_quantity - 1
        where id = $1
        `,
        [p.id],
      );
    }

    const activationId = makeId();
    const activatedAt = new Date();
    const expiresAt = Date.now() + 1000 * 60 * 10;

    await client.query(
      `
      insert into activations (
        id, telegram_id, store_id, product_ids, activated_at, expires_at, redeemed
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        activationId,
        String(telegramId),
        String(storeId),
        productIds,
        activatedAt.toISOString(),
        expiresAt,
        false,
      ],
    );

    await client.query("commit");

    await writeAuditLog({
      actorType: "user",
      actorId: String(telegramId),
      action: "activation_created",
      entityType: "activation",
      entityId: activationId,
      metadata: {
        storeId: String(storeId),
        productIds,
      },
    });

    const qrPayload = JSON.stringify({
      activationId,
      storeId,
      telegramId: String(telegramId),
    });

    const qr = await QRCode.toDataURL(qrPayload);

    res.json({
      success: true,
      qr,
      qrPayload,
      activation: {
        _id: activationId,
        telegramId: String(telegramId),
        storeId: String(storeId),
        productIds,
        activatedAt: activatedAt.toISOString(),
        expiresAt,
        redeemed: false,
      },
    });
  } catch (err) {
    await client.query("rollback");
    console.error("activate-store error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

/* MY DEALS */

app.get("/api/my-deals/:telegramId", async (req, res) => {
  try {
    const activationsRes = await pool.query(
      `
      select * from activations
      where telegram_id = $1
      order by activated_at desc
      `,
      [String(req.params.telegramId)],
    );

    const items = [];
    for (const a of activationsRes.rows) {
      const storeRes = await pool.query(
        `select * from stores where id = $1 limit 1`,
        [a.store_id],
      );

      const productsRes = await pool.query(
        `select * from products where id = any($1::text[])`,
        [a.product_ids || []],
      );

      items.push({
        _id: a.id,
        telegramId: a.telegram_id,
        storeId: a.store_id,
        productIds: a.product_ids || [],
        activatedAt: a.activated_at,
        expiresAt: a.expires_at,
        redeemed: a.redeemed,
        redeemedAt: a.redeemed_at,
        store: storeRes.rows[0] ? mapStore(storeRes.rows[0]) : null,
        products: productsRes.rows.map(mapProduct),
      });
    }

    res.json(items);
  } catch (err) {
    console.error("my-deals error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* REDEEM */

app.post("/api/redeem", requireMerchant, async (req, res) => {
  try {
    const { activationId } = req.body;

    if (!activationId) {
      return res.status(400).json({ error: "activationId is required" });
    }

    const activationRes = await pool.query(
      `select * from activations where id = $1 limit 1`,
      [activationId],
    );

    if (!activationRes.rows.length) {
      return res.status(404).json({ error: "Activation not found" });
    }

    const activation = activationRes.rows[0];

    if (req.merchant?.storeId && req.merchant.storeId !== activation.store_id) {
      return res.status(403).json({ error: "This QR belongs to another store" });
    }

    if (req.merchant?.storeId && req.merchant.storeId !== activation.store_id) {
      return res.status(403).json({ error: "This QR belongs to another store" });
    }

    if (Date.now() > Number(activation.expires_at)) {
      return res.status(400).json({ error: "QR expired" });
    }

    if (activation.redeemed) {
      return res.status(400).json({ error: "QR already used" });
    }

    await pool.query(
      `
      update activations
      set redeemed = true, redeemed_at = now()
      where id = $1
      `,
      [activationId],
    );

    const storeRes = await pool.query(
      `select * from stores where id = $1 limit 1`,
      [activation.store_id],
    );

    const productsRes = await pool.query(
      `select * from products where id = any($1::text[])`,
      [activation.product_ids || []],
    );

    const userRes = await pool.query(
      `select * from users where telegram_id = $1 limit 1`,
      [activation.telegram_id],
    );

    res.json({
      success: true,
      activation: {
        _id: activation.id,
        telegramId: activation.telegram_id,
        storeId: activation.store_id,
        productIds: activation.product_ids || [],
        activatedAt: activation.activated_at,
        expiresAt: activation.expires_at,
        redeemed: true,
        redeemedAt: new Date().toISOString(),
      },
      store: storeRes.rows[0] ? mapStore(storeRes.rows[0]) : null,
      products: productsRes.rows.map(mapProduct),
      user: userRes.rows[0] ? mapUser(userRes.rows[0]) : null,
    });
  } catch (err) {
    console.error("redeem error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/activations/preview", requireMerchant, async (req, res) => {
  try {
    const { activationId } = req.body;

    if (!activationId) {
      return res.status(400).json({ error: "activationId is required" });
    }

    const activationRes = await pool.query(
      `select * from activations where id = $1 limit 1`,
      [activationId],
    );

    if (!activationRes.rows.length) {
      return res.status(404).json({ error: "Activation not found" });
    }

    const activation = activationRes.rows[0];

    const storeRes = await pool.query(
      `select * from stores where id = $1 limit 1`,
      [activation.store_id],
    );

    const productsRes = await pool.query(
      `select * from products where id = any($1::text[])`,
      [activation.product_ids || []],
    );

    const userRes = await pool.query(
      `select * from users where telegram_id = $1 limit 1`,
      [activation.telegram_id],
    );

    await writeAuditLog({
      actorType: req.merchant ? "merchant" : "merchant_api_key",
      actorId: req.merchant?.login || "shared-key",
      action: "activation_redeemed",
      entityType: "activation",
      entityId: activationId,
      metadata: {
        storeId: activation.store_id,
        telegramId: activation.telegram_id,
        productIds: activation.product_ids || [],
      },
    });

    res.json({
      success: true,
      activation: {
        _id: activation.id,
        telegramId: activation.telegram_id,
        storeId: activation.store_id,
        productIds: activation.product_ids || [],
        activatedAt: activation.activated_at,
        expiresAt: activation.expires_at,
        redeemed: activation.redeemed,
        redeemedAt: activation.redeemed_at,
      },
      store: storeRes.rows[0] ? mapStore(storeRes.rows[0]) : null,
      products: productsRes.rows.map(mapProduct),
      user: userRes.rows[0] ? mapUser(userRes.rows[0]) : null,
    });
  } catch (err) {
    console.error("activation preview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/activations", requireMerchant, async (req, res) => {
  try {
    const result = req.merchant?.storeId
      ? await pool.query(
          `select * from activations where store_id = $1 order by activated_at desc`,
          [req.merchant.storeId],
        )
      : await pool.query(`select * from activations order by activated_at desc`);

    res.json(
      result.rows.map((a) => ({
        _id: a.id,
        telegramId: a.telegram_id,
        storeId: a.store_id,
        productIds: a.product_ids || [],
        activatedAt: a.activated_at,
        expiresAt: a.expires_at,
        redeemed: a.redeemed,
        redeemedAt: a.redeemed_at,
      })),
    );
  } catch (err) {
    console.error("activations error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/activations", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      select
        a.*,
        s.name as store_name,
        u.first_name as user_first_name,
        u.username as user_username
      from activations a
      left join stores s on s.id = a.store_id
      left join users u on u.telegram_id = a.telegram_id
      order by a.activated_at desc
    `);

    res.json(
      result.rows.map((a) => ({
        _id: a.id,
        telegramId: a.telegram_id,
        storeId: a.store_id,
        storeName: a.store_name || "",
        userFirstName: a.user_first_name || "",
        username: a.user_username || "",
        productIds: a.product_ids || [],
        activatedAt: a.activated_at,
        expiresAt: a.expires_at,
        redeemed: a.redeemed,
        redeemedAt: a.redeemed_at,
      })),
    );
  } catch (err) {
    console.error("admin activations error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      select *
      from audit_logs
      order by created_at desc
      limit 200
    `);

    res.json(
      result.rows.map((row) => ({
        _id: row.id,
        actorType: row.actor_type,
        actorId: row.actor_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      })),
    );
  } catch (err) {
    console.error("audit logs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/merchant-accounts", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      select
        m.*,
        s.name as store_name
      from merchant_accounts m
      join stores s on s.id = m.store_id
      order by s.name asc, m.login asc
    `);

    res.json(
      result.rows.map((row) => ({
        _id: row.id,
        storeId: row.store_id,
        storeName: row.store_name,
        login: row.login,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    );
  } catch (err) {
    console.error("merchant accounts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/merchant-accounts", requireAdmin, async (req, res) => {
  try {
    const { storeId, login, password } = req.body;

    if (!storeId || !login || !password) {
      return res
        .status(400)
        .json({ error: "storeId, login and password are required" });
    }

    const storeRes = await pool.query(
      `select * from stores where id = $1 limit 1`,
      [storeId],
    );

    if (!storeRes.rows.length) {
      return res.status(404).json({ error: "Store not found" });
    }

    const existingRes = await pool.query(
      `select * from merchant_accounts where login = $1 limit 1`,
      [String(login).trim()],
    );

    let account;

    if (existingRes.rows.length) {
      const updated = await pool.query(
        `
        update merchant_accounts
        set
          store_id = $2,
          password_hash = $3,
          is_active = true,
          updated_at = now()
        where login = $1
        returning *
        `,
        [String(login).trim(), storeId, hashMerchantPassword(password)],
      );
      account = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `
        insert into merchant_accounts (
          id, store_id, login, password_hash, is_active
        )
        values ($1, $2, $3, $4, $5)
        returning *
        `,
        [makeId(), storeId, String(login).trim(), hashMerchantPassword(password), true],
      );
      account = inserted.rows[0];
    }

    await writeAuditLog({
      actorType: "admin",
      actorId: getAdminActorId(),
      action: "merchant_account_upserted",
      entityType: "merchant_account",
      entityId: account.id,
      metadata: {
        storeId: account.store_id,
        login: account.login,
      },
    });

    res.json({
      success: true,
      merchantAccount: {
        _id: account.id,
        storeId: account.store_id,
        login: account.login,
        isActive: account.is_active,
      },
    });
  } catch (err) {
    console.error("upsert merchant account error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/merchant/login", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: "login and password are required" });
    }

    const result = await pool.query(
      `
      select
        m.*,
        s.name as store_name
      from merchant_accounts m
      join stores s on s.id = m.store_id
      where m.login = $1
      limit 1
      `,
      [String(login).trim()],
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Invalid login or password" });
    }

    const account = result.rows[0];

    if (!account.is_active) {
      return res.status(403).json({ error: "Merchant account is disabled" });
    }

    if (account.password_hash !== hashMerchantPassword(password)) {
      return res.status(401).json({ error: "Invalid login or password" });
    }

    const token = signMerchantToken({
      merchantAccountId: account.id,
      storeId: account.store_id,
      login: account.login,
    });

    await writeAuditLog({
      actorType: "merchant",
      actorId: account.login,
      action: "merchant_logged_in",
      entityType: "merchant_account",
      entityId: account.id,
      metadata: {
        storeId: account.store_id,
      },
    });

    res.json({
      success: true,
      token,
      merchant: {
        _id: account.id,
        login: account.login,
        storeId: account.store_id,
        storeName: account.store_name,
      },
    });
  } catch (err) {
    console.error("merchant login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* TELEGRAM AUTH */

async function telegramApi(method, body) {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    throw new Error("BOT_TOKEN is not configured");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API ${method} failed`);
  }

  return data.result;
}

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
      return res.status(500).json({ error: "WEBHOOK_BASE_URL is not configured" });
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

/* BOT */

const BOT_TOKEN = "";

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN not found");
} else {
  const bot = new TelegramBot(BOT_TOKEN, { polling: false });

  async function startBot() {
    try {
      await bot.deleteWebHook();
      await bot.startPolling();

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
    } catch (err) {
      console.error("Bot start error:", err.message);
    }
  }

  startBot();
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});
