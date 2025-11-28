/**
 * 唯讀命令結果型別定義
 * 所有唯讀命令（search, analyze, deps）共用此結構
 */

/** 唯讀命令類型 */
export enum QueryCommand {
  Search = 'search',
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
  /** 分數 */
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

// ========== Snapshot 結果 ==========

/** 模組快照資料 */
export interface ModuleSnapshotData {
  /** 模組名稱 */
  module: string;
  /** API（class 的 public 方法） */
  api: Record<string, Record<string, string>>;
  /** 工廠函數 */
  factories: Record<string, string>;
  /** 型別定義 */
  types: Record<string, string>;
  /** 私有資訊 */
  private: Record<string, { fields: string[]; imports: string }>;
}

/** 專案快照資料 */
export interface ProjectSnapshotData {
  /** 專案名稱 */
  project: string;
  /** 模組快照 */
  modules: Record<string, ModuleSnapshotData>;
}

/** Snapshot 結果 */
export interface SnapshotResult extends QueryResult {
  command: QueryCommand.Snapshot;
  /** 快照類型 */
  snapshotType: 'module' | 'project';
  /** 快照資料 */
  snapshot: ModuleSnapshotData | ProjectSnapshotData;
}

