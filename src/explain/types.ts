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
  tokenUsage: { input: number; output: number };
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
  performance?: {
    gitFetchMs: number;
    astAnalysisMs: number;
    llmCallMs: number;
    totalMs: number;
    batchCount: number;
  };
}
