/**
 * 唯讀命令結果型別定義
 * 所有唯讀命令（search, shit, analyze, deps, snapshot）共用此結構
 */

/** 唯讀命令類型 */
export enum QueryCommand {
  Search = 'search',
  Shit = 'shit',
  Analyze = 'analyze',
  Deps = 'deps',
  Snapshot = 'snapshot'
}

/** 問題嚴重度 */
export enum IssueSeverity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low'
}

/** 通用問題項目 */
export interface QueryIssue {
  /** 問題類型 */
  type: string;
  /** 嚴重度 */
  severity?: IssueSeverity;
  /** 問題訊息 */
  message: string;
  /** 檔案路徑 */
  filePath?: string;
  /** 行號 */
  line?: number;
  /** 分數（如 shit score） */
  score?: number;
}

/** 通用統計摘要 */
export interface QuerySummary {
  /** 掃描項目總數 */
  totalScanned?: number;
  /** 發現問題數 */
  issuesFound?: number;
  /** 額外統計欄位 */
  [key: string]: unknown;
}

/**
 * 唯讀命令結果基底介面
 * 所有唯讀命令的結果都應擴展此介面
 */
export interface QueryResult {
  /** 命令類型 */
  command: QueryCommand;
  /** 是否成功 */
  success: boolean;
  /** 統計摘要 */
  summary: QuerySummary;
  /** 問題列表 */
  issues?: QueryIssue[];
  /** 命令特定資料 */
  data?: unknown;
  /** 錯誤訊息 */
  errors?: string[];
}

// ========== 各命令特化結果 ==========

/** 維度分數 */
export interface DimensionScore {
  /** 原始分數 */
  score: number;
  /** 權重 */
  weight: number;
  /** 加權後分數 */
  weightedScore: number;
}

/** 修復建議 */
export interface Recommendation {
  /** 建議類別 */
  category: string;
  /** 優先級 */
  priority: number;
  /** 建議內容 */
  suggestion: string;
  /** 預期改善分數 */
  estimatedImpact: number;
  /** 影響檔案數 */
  affectedFiles: string[];
}

/** ShitScore 結果 */
export interface ShitResult extends QueryResult {
  command: QueryCommand.Shit;
  /** 總分（0-100，越高越糟） */
  shitScore: number;
  /** 評級（S/A/B/C/D/E/F） */
  grade: string;
  /** 評級資訊 */
  gradeInfo: {
    emoji: string;
    message: string;
  };
  /** 維度分數 */
  dimensions: {
    complexity: DimensionScore;
    maintainability: DimensionScore;
    architecture: DimensionScore;
    qualityAssurance?: DimensionScore;
  };
  /** 最糟項目列表 */
  topShit?: ShitItem[];
  /** 修復建議 */
  recommendations?: Recommendation[];
  /** 分析時間 */
  analyzedAt?: Date;
}

/** Shit 項目（對應 core 的 ShitItem） */
export interface ShitItem {
  /** 類型 */
  type: string;
  /** 嚴重度 */
  severity: string;
  /** 分數 */
  score: number;
  /** 檔案路徑 */
  filePath: string;
  /** 描述 */
  description: string;
  /** 位置 */
  location?: {
    line: number;
    column?: number;
  };
}

/** 搜尋結果項目 */
export interface SearchMatch {
  /** 檔案路徑 */
  filePath: string;
  /** 行號 */
  line: number;
  /** 欄位 */
  column?: number;
  /** 匹配內容 */
  content: string;
  /** 上下文 */
  context?: string[];
}

/** Search 結果 */
export interface SearchResult extends QueryResult {
  command: QueryCommand.Search;
  /** 搜尋結果 */
  results: SearchMatch[];
  /** 是否被截斷 */
  truncated?: boolean;
  /** 搜尋耗時（毫秒） */
  searchTime?: number;
}

/** 循環依賴資訊 */
export interface CycleInfo {
  /** 循環路徑 */
  cycle: string[];
  /** 涉及檔案數 */
  length: number;
}

/** 依賴圖節點 */
export interface GraphNode {
  /** 節點 ID（檔案路徑） */
  id: string;
  /** 節點標籤 */
  label?: string;
}

/** 依賴圖邊 */
export interface GraphEdge {
  /** 來源節點 */
  from: string;
  /** 目標節點 */
  to: string;
}

/** Deps 結果 */
export interface DepsResult extends QueryResult {
  command: QueryCommand.Deps;
  /** 循環依賴 */
  cycles?: CycleInfo[];
  /** 依賴圖 */
  graph?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  /** 孤立檔案 */
  orphans?: string[];
}

/** Analyze 分析類型 */
export enum AnalyzeType {
  Complexity = 'complexity',
  DeadCode = 'dead-code',
  BestPractices = 'best-practices',
  Patterns = 'patterns',
  Quality = 'quality'
}

/** Analyze 結果 */
export interface AnalyzeResult extends QueryResult {
  command: QueryCommand.Analyze;
  /** 分析類型 */
  analyzeType: AnalyzeType;
  /** 分析指標 */
  metrics?: Record<string, unknown>;
}

/** Snapshot 操作類型 */
export enum SnapshotAction {
  Generate = 'generate',
  Info = 'info',
  Diff = 'diff',
  Init = 'init',
  List = 'list'
}

/** Snapshot 統計 */
export interface SnapshotStats {
  /** 檔案數 */
  files: number;
  /** 總行數 */
  lines: number;
  /** 總大小（bytes） */
  size: number;
  /** 符號數量 */
  symbolCount?: number;
  /** 依賴關係數 */
  dependencyCount?: number;
  /** 估計 token 數 */
  estimatedTokens?: number;
  /** 壓縮率 */
  compressionRatio?: number;
  /** 生成耗時（ms） */
  generationTime?: number;
}

/** Snapshot 結果 */
export interface SnapshotResult extends QueryResult {
  command: QueryCommand.Snapshot;
  /** 操作類型 */
  action: SnapshotAction;
  /** Snapshot 路徑 */
  snapshotPath?: string;
  /** 統計資訊 */
  stats?: SnapshotStats;
}

