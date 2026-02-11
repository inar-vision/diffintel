const fs = require("fs");

function loadIntent(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const intent = JSON.parse(raw);
  if (!intent.features || !Array.isArray(intent.features)) {
    throw new Error("intent.json must contain a 'features' array");
  }
  return intent;
}

/**
 * Normalize a v0.1 intent to v0.2 format in-memory.
 * Missing `status` defaults to "approved", version becomes "0.2".
 */
function normalizeIntent(intent) {
  const normalized = { ...intent };
  normalized.version = "0.2";

  if (!normalized.meta) {
    normalized.meta = {};
  }

  normalized.features = (intent.features || []).map((f) => ({
    status: "approved",
    ...f,
  }));

  return normalized;
}

module.exports = { loadIntent, normalizeIntent };
