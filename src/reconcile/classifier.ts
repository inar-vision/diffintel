import { ReportFeature, ConstraintResult, UnfixableIssue, Config } from "../types";
import { DEFAULTS } from "../config";

interface ClassifiedIssues {
  fixable: {
    missing: ReportFeature[];
    failedConstraints: ConstraintResult[];
    contractViolations: ReportFeature[];
  };
  unfixable: UnfixableIssue[];
}

function identifierExistsInSource(name: string, sourceContext: Record<string, string>): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`);
  for (const content of Object.values(sourceContext)) {
    if (pattern.test(content)) return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classifyIssues(
  missing: ReportFeature[],
  failedConstraints: ConstraintResult[],
  contractViolations: ReportFeature[],
  sourceContext: Record<string, string>,
  config?: Config,
): ClassifiedIssues {
  const fixableMissing: ReportFeature[] = [];
  const fixableConstraints: ConstraintResult[] = [];
  const fixableContracts: ReportFeature[] = [];
  const unfixable: UnfixableIssue[] = [];

  // Missing features: fixable only if we have source context (patterns to follow)
  const hasSource = Object.keys(sourceContext).length > 0;
  for (const f of missing) {
    if (hasSource) {
      fixableMissing.push(f);
    } else {
      unfixable.push({
        type: "missing",
        id: f.id,
        reason: "No source files in context to use as patterns",
      });
    }
  }

  // Constraints
  for (const cr of failedConstraints) {
    if (cr.rule === "no-direct-import" || cr.rule === "async-error-handling") {
      fixableConstraints.push(cr);
      continue;
    }

    if (cr.rule === "routes-require-middleware") {
      // Check if all expected middleware identifiers exist in source
      const missingMiddleware: string[] = [];
      for (const v of cr.violations) {
        if (v.expected) {
          const names = v.expected.split(",").map((s) => s.trim()).filter(Boolean);
          for (const name of names) {
            if (!identifierExistsInSource(name, sourceContext)) {
              missingMiddleware.push(name);
            }
          }
        }
      }
      if (missingMiddleware.length > 0) {
        unfixable.push({
          type: "constraint",
          id: cr.featureId,
          reason: `Middleware not found in codebase: ${[...new Set(missingMiddleware)].join(", ")}`,
        });
      } else {
        fixableConstraints.push(cr);
      }
      continue;
    }

    // Unknown constraint rules: assume fixable
    fixableConstraints.push(cr);
  }

  // Contract violations (auth)
  const authMiddleware = config?.contracts?.authMiddleware
    ?? DEFAULTS.contracts!.authMiddleware!;

  for (const f of contractViolations) {
    const authViolations = (f.contractViolations || []).filter((v) => v.contract === "auth");
    if (authViolations.length === 0) {
      // Non-auth contract violation — assume fixable
      fixableContracts.push(f);
      continue;
    }

    const anyAuthFound = authMiddleware.some((name) =>
      identifierExistsInSource(name, sourceContext)
    );
    if (anyAuthFound) {
      fixableContracts.push(f);
    } else {
      unfixable.push({
        type: "contract",
        id: f.id,
        reason: "No auth middleware found in codebase",
      });
    }
  }

  return {
    fixable: {
      missing: fixableMissing,
      failedConstraints: fixableConstraints,
      contractViolations: fixableContracts,
    },
    unfixable,
  };
}

export { classifyIssues, identifierExistsInSource, ClassifiedIssues };
