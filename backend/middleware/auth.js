function createRequireAdmin({ adminApiKey, getApiKey }) {
  return function requireAdmin(req, res, next) {
    if (!adminApiKey) {
      return res.status(500).json({ error: "ADMIN_API_KEY is not configured" });
    }

    if (getApiKey(req) !== adminApiKey) {
      return res.status(401).json({ error: "Admin access denied" });
    }

    next();
  };
}

module.exports = {
  createRequireAdmin,
};
