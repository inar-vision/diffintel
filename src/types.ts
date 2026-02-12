export interface IntentFeature {
  id: string;
  type: string;
  status?: "draft" | "approved" | "deprecated";
  description?: string;
  method?: string;
  path?: string;
  pattern?: string;
  response?: {
    status?: number;
    contentType?: string;
  };
}

export interface IntentDocument {
  version: string;
  meta?: {
    name?: string;
    description?: string;
  };
  features: IntentFeature[];
}

export interface Implementation {
  type: string;
  method: string;
  path: string;
  file: string;
  line?: number;
  analyzer?: string;
}

export interface MatchResult {
  found: boolean;
  implementedIn: string | null;
  line: number | null;
}

export interface Analyzer {
  name: string;
  supportedTypes: string[];
  fileExtensions?: string[];
  analyze(files: string[]): Implementation[];
  match(feature: IntentFeature, implementations: Implementation[]): MatchResult;
}

export interface ReportFeature {
  id: string;
  type?: string;
  status?: string;
  result: "present" | "missing" | "skipped" | "unanalyzable";
  implementedIn?: string;
  line?: number;
  analyzer?: string;
  method?: string;
  path?: string;
  reason?: string;
}

export interface ExtraFeature {
  method: string;
  path: string;
  implementedIn: string;
  line?: number;
  analyzer?: string;
}

export interface ReportSummary {
  totalDeclared: number;
  analyzed: number;
  unanalyzable: number;
  present: number;
  missing: number;
  extra: number;
  draft: number;
  deprecated: number;
  complianceScore: number;
}

export interface Report {
  version: string;
  meta: {
    intentFile: string;
    intentVersion: string;
    timestamp: string;
    analyzers: string[];
  };
  summary: ReportSummary;
  features: ReportFeature[];
  extraFeatures: ExtraFeature[];
  drift: {
    hasDrift: boolean;
    missingCount: number;
    extraCount: number;
  };
}

export interface Config {
  intentFile: string;
  scanDir: string;
  exclude: string[];
  analyzers?: {
    include?: string[];
    custom?: string[];
  };
}

export interface CheckResult {
  presentFeatures: Array<{
    id: string;
    status?: string;
    type?: string;
    implementedIn?: string;
    analyzer?: string;
    line?: number;
    method?: string;
    path?: string;
  }>;
  missingFeatures: Array<{
    id: string;
    status?: string;
    method?: string;
    path?: string;
  }>;
  extraFeatures: ExtraFeature[];
  draftFeatures: Array<{
    id: string;
    type: string;
    status: string;
    method?: string;
    path?: string;
  }>;
  deprecatedFeatures: Array<{
    id: string;
    status: string;
    implementedIn?: string;
    analyzer?: string;
    line?: number;
    method?: string;
    path?: string;
  }>;
  unannotatedFeatures: Array<{
    id: string;
    type: string;
    status: string;
    reason: string;
  }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DiffResult {
  scoreBefore: number | null;
  scoreAfter: number;
  newlyPresent: ReportFeature[];
  newlyMissing: ReportFeature[];
  stillMissing: ReportFeature[];
  newFeatures: ReportFeature[];
  removedFeatures: ReportFeature[];
  newExtras: ExtraFeature[];
  resolvedExtras: ExtraFeature[];
}
