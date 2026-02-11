const fs = require("fs");

function loadIntent(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const intent = JSON.parse(raw);
  if (!intent.features || !Array.isArray(intent.features)) {
    throw new Error("intent.json must contain a 'features' array");
  }
  return intent;
}

module.exports = { loadIntent };
