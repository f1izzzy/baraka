function createAuditLogger({ pool, makeId }) {
  return async function writeAuditLog({
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
  };
}

module.exports = {
  createAuditLogger,
};
