const fs = require("fs");
const path = require("path");

const STARTER_INTENT = {
  version: "0.1",
  features: [
    {
      id: "example-feature",
      type: "http-route",
      method: "GET",
      path: "/example",
    },
  ],
};

function run(options = {}) {
  const targetPath = path.resolve(process.cwd(), "intent.json");

  if (fs.existsSync(targetPath) && !options.force) {
    console.error(
      `intent.json already exists. Use --force to overwrite.`
    );
    return 1;
  }

  fs.writeFileSync(
    targetPath,
    JSON.stringify(STARTER_INTENT, null, 2) + "\n"
  );
  console.log(`Created ${targetPath}`);
  return 0;
}

module.exports = { run };
