export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileHistoryEntry {
  hash: string;
  message: string;
  age: string;
  diff?: string;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  hunks: string;
  oldContent?: string;
  newContent?: string;
  additions: number;
  deletions: number;
  recentHistory: FileHistoryEntry[];
}

export type ChangeAction = "added" | "removed" | "modified";
export type ChangeType = "function" | "import" | "export" | "class" | "variable" | "route" | "other";

export interface StructuralChange {
  file: string;
  type: ChangeType;
  action: ChangeAction;
  name: string;
  startLine?: number;
  detail?: string;
}

export interface ControlFlowAnnotation {
  functionName: string;
  line: number;
  kind: "guard" | "try-catch";
  description: string;
}

export interface FileAnalysis {
  path: string;
  status: FileStatus;
  language: string | null;
  structuralChanges: StructuralChange[];
  controlFlowAnnotations: ControlFlowAnnotation[];
  baseDeclarations: string[];
  recentHistory: FileHistoryEntry[];
  rawDiff: string;
}

export interface Fix {
  description: string;
}

export interface Risk {
  level: "low" | "medium" | "high";
  description: string;
}

export interface FileExplanation {
  path: string;
  summary: string;
  notes: string[];
}

export interface LLMExplanation {
  title: string;
  description: string;
  impact: string[];
  fixes: Fix[];
  risks: Risk[];
  fileExplanations: FileExplanation[];
  blastRadiusSummary: string;
  tokenUsage: { input: number; output: number };
}

export interface DependencyEdge {
  /** The file that contains the import */
  from: string;
  /** The file being imported */
  to: string;
  /** The raw import specifier as written in source */
  specifier: string;
  /** Specific symbols imported, if detectable (e.g. named imports) */
  symbols: string[];
}

export interface DependencyGraph {
  /** Files that changed files import (what do we depend on?) */
  forwardDeps: DependencyEdge[];
  /** Unchanged files that import changed files (what might break?) */
  reverseDeps: DependencyEdge[];
  /** Second-ring: files that import the reverse deps (wider blast radius) */
  secondRingDeps: DependencyEdge[];
  /** Total repo files scanned for reverse deps */
  repoFilesScanned: number;
  /** Time taken in ms */
  scanTimeMs: number;
}

export interface ExplainReport {
  generatedAt: string;
  baseRef: string;
  headRef: string;
  summary: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  explanation: LLMExplanation;
  files: FileAnalysis[];
  dependencyGraph?: DependencyGraph;
}
