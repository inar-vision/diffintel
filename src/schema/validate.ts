import Ajv from "ajv";
import intentSchema from "./intent-schema.json";
import { IntentDocument, ValidationResult } from "../types";

const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(intentSchema);

function validateIntent(intent: IntentDocument): ValidationResult {
  const valid = validateSchema(intent);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validateSchema.errors || []).map((err) => {
    const path = err.instancePath || "/";
    if (err.keyword === "enum") {
      return `${path}: must be one of ${JSON.stringify(err.params?.allowedValues)}`;
    }
    if (err.keyword === "required") {
      return `${path}: missing required field '${err.params?.missingProperty}'`;
    }
    if (err.keyword === "additionalProperties") {
      return `${path}: unknown field '${err.params?.additionalProperty}'`;
    }
    return `${path}: ${err.message}`;
  });

  // Deduplicate errors (allOf branches can produce duplicates)
  const unique = [...new Set(errors)];

  return { valid: false, errors: unique };
}

function checkDuplicateIds(intent: IntentDocument): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const feature of intent.features || []) {
    if (feature.id) {
      if (seen.has(feature.id)) {
        duplicates.push(feature.id);
      }
      seen.add(feature.id);
    }
  }
  return duplicates;
}

export { validateIntent, checkDuplicateIds };
