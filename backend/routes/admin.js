function registerAdminRoutes(app, deps) {
  const {
    pool,
    requireAdmin,
    writeAuditLog,
    hashMerchantPassword,
    signMerchantToken,
    makeId,
    getAdminActorId,
  } = deps;

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
          [
            makeId(),
            storeId,
            String(login).trim(),
            hashMerchantPassword(password),
            true,
          ],
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
}

module.exports = {
  registerAdminRoutes,
};
