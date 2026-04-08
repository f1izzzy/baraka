function registerCatalogRoutes(app, deps) {
  const {
    pool,
    requireAdmin,
    mapStore,
    mapProduct,
    writeAuditLog,
    makeId,
    getAdminActorId,
  } = deps;

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
        return res.json({
          _id: existing.rows[0].id,
          telegramId: existing.rows[0].telegram_id,
          firstName: existing.rows[0].first_name,
          username: existing.rows[0].username,
          createdAt: existing.rows[0].created_at,
        });
      }

      const inserted = await pool.query(
        `
        insert into users (id, telegram_id, first_name, username)
        values ($1, $2, $3, $4)
        returning *
        `,
        [makeId(), String(telegramId), firstName || "", username || ""],
      );

      res.json({
        _id: inserted.rows[0].id,
        telegramId: inserted.rows[0].telegram_id,
        firstName: inserted.rows[0].first_name,
        username: inserted.rows[0].username,
        createdAt: inserted.rows[0].created_at,
      });
    } catch (err) {
      console.error("users/login error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

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
        select *
        from favorites
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
}

module.exports = {
  registerCatalogRoutes,
};
