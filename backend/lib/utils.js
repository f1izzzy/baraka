const crypto = require("crypto");

function makeId() {
  return crypto.randomUUID();
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

function getAdminActorId() {
  return "admin-api-key";
}

module.exports = {
  makeId,
  isFutureOrNull,
  getApiKey,
  getBearerToken,
  getAdminActorId,
};
