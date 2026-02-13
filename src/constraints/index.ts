import {
  IntentFeature,
  Implementation,
  ConstraintResult,
  ConstraintViolation,
  ConstraintRule,
} from "../types";
import { routesRequireMiddleware } from "./rules/routes-require-middleware";
import { noDirectImport } from "./rules/no-direct-import";
import { asyncErrorHandling } from "./rules/async-error-handling";

const builtinRules = new Map<string, ConstraintRule>([
  ["routes-require-middleware", routesRequireMiddleware],
  ["no-direct-import", noDirectImport],
  ["async-error-handling", asyncErrorHandling],
]);

export function validateConstraints(
  constraintFeatures: IntentFeature[],
  allImplementations: Implementation[],
  sourceFiles: string[]
): ConstraintResult[] {
  const results: ConstraintResult[] = [];

  for (const feature of constraintFeatures) {
    const status = feature.status || "approved";
    if (status === "draft") continue;

    const ruleName = feature.rule!;
    const ruleFn = builtinRules.get(ruleName);

    if (!ruleFn) {
      results.push({
        featureId: feature.id,
        rule: ruleName,
        status: "failed",
        violations: [
          {
            constraint: feature.id,
            rule: ruleName,
            message: `Unknown constraint rule: '${ruleName}'`,
          },
        ],
      });
      continue;
    }

    const violations = ruleFn(feature, allImplementations, sourceFiles);

    results.push({
      featureId: feature.id,
      rule: ruleName,
      status: violations.length === 0 ? "passed" : "failed",
      violations,
    });
  }

  return results;
}
