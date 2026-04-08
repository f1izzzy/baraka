const crypto = require("crypto");

function createMerchantAuth({
  merchantApiKey,
  merchantTokenSecret,
  getApiKey,
  getBearerToken,
}) {
  function hashMerchantPassword(password) {
    return crypto.createHash("sha256").update(String(password)).digest("hex");
  }

  function signMerchantToken(payload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signature = crypto
      .createHmac("sha256", merchantTokenSecret)
      .update(encodedPayload)
      .digest("base64url");

    return `${encodedPayload}.${signature}`;
  }

  function verifyMerchantToken(token) {
    if (!token || !token.includes(".")) return null;

    const [encodedPayload, signature] = token.split(".");
    const expectedSignature = crypto
      .createHmac("sha256", merchantTokenSecret)
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

  function requireMerchant(req, res, next) {
    const merchantToken = getBearerToken(req);
    const merchantSession = verifyMerchantToken(merchantToken);

    if (merchantSession) {
      req.merchant = merchantSession;
      return next();
    }

    if (!merchantApiKey) {
      return res
        .status(500)
        .json({ error: "MERCHANT_API_KEY is not configured" });
    }

    if (getApiKey(req) !== merchantApiKey) {
      return res.status(401).json({ error: "Merchant access denied" });
    }

    next();
  }

  return {
    hashMerchantPassword,
    signMerchantToken,
    verifyMerchantToken,
    requireMerchant,
  };
}

module.exports = {
  createMerchantAuth,
};
