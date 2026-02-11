const { loadConfig } = require("../config");
const { loadIntent } = require("../core/intent");

function run(options = {}) {
  const config = loadConfig({ intentFile: options.intent });
  const intentFile = config.intentFile;

  let intent;
  try {
    intent = loadIntent(intentFile);
  } catch (err) {
    console.error(`Validation failed: ${err.message}`);
    return 1;
  }

  const errors = [];

  if (!intent.version) {
    errors.push("Missing 'version' field");
  }

  if (!intent.features || !Array.isArray(intent.features)) {
    errors.push("Missing or invalid 'features' array");
  } else {
    for (let i = 0; i < intent.features.length; i++) {
      const f = intent.features[i];
      if (!f.id) errors.push(`features[${i}]: missing 'id'`);
      if (!f.type) errors.push(`features[${i}]: missing 'type'`);
      if (f.type === "http-route") {
        if (!f.method) errors.push(`features[${i}]: missing 'method'`);
        if (!f.path) errors.push(`features[${i}]: missing 'path'`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Validation errors in ${intentFile}:`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  console.log(`${intentFile} is valid.`);
  return 0;
}

module.exports = { run };
