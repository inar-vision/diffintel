import { loadConfig } from "../config";
import { loadIntent } from "../core/intent";
import { validateIntent, checkDuplicateIds } from "../schema/validate";

interface ValidateOptions {
  intent?: string;
}

function run(options: ValidateOptions = {}): number {
  const config = loadConfig({ intentFile: options.intent });
  const intentFile = config.intentFile;

  let intent;
  try {
    intent = loadIntent(intentFile);
  } catch (err: any) {
    console.error(`Validation failed: ${err.message}`);
    return 1;
  }

  const result = validateIntent(intent);
  const duplicates = checkDuplicateIds(intent);

  const allErrors = [...result.errors];
  if (duplicates.length > 0) {
    for (const id of duplicates) {
      allErrors.push(`Duplicate feature id: '${id}'`);
    }
  }

  if (allErrors.length > 0) {
    console.error(`Validation errors in ${intentFile}:`);
    for (const err of allErrors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  console.log(`${intentFile} is valid.`);
  return 0;
}

export { run };
