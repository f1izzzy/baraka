const QRCode = require("qrcode");

function registerActivationRoutes(app, deps) {
  const {
    pool,
    requireMerchant,
    mapStore,
    mapProduct,
    mapUser,
    writeAuditLog,
    makeId,
    isFutureOrNull,
  } = deps;

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

      if (req.merchant?.storeId && req.merchant.storeId !== activation.store_id) {
        return res.status(403).json({ error: "This QR belongs to another store" });
      }

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
}

module.exports = {
  registerActivationRoutes,
};
