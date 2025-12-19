/**
 * 唯讀命令結果型別定義
 * 所有唯讀命令（search, analyze, deps）共用此結構
 */

/** 唯讀命令類型 */
export enum QueryCommand {
  Search = 'search',
  Analyze = 'analyze',
  Deps = 'deps',
  Snapshot = 'snapshot',
  FindReferences = 'find-references',
  CallHierarchy = 'call-hierarchy'
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

/** 影響分析結果 */
export interface ImpactInfo {
  /** 目標檔案 */
  targetFile: string;
  /** 依賴此檔案的檔案 */
  dependents: string[];
  /** 此檔案依賴的檔案 */
  dependencies: string[];
  /** 總影響數 */
  totalAffected: number;
}

/** Deps 結果 */
export interface DepsResult extends QueryResult {
  command: QueryCommand.Deps;
  /** 循環依賴 */
  cycles: CycleInfo[];
  /** 影響分析 */
  impact?: ImpactInfo;
  /** 專案根目錄路徑（用於計算相對路徑） */
  basePath?: string;
}

/** Analyze 分析類型 */
export enum AnalyzeType {
  Complexity = 'complexity',
  DeadCode = 'dead-code'
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

/** 增量快照差異符號 */
export interface DeltaSymbolData {
  /** 所屬模組 */
  module: string;
  /** 符號名稱 */
  name: string;
  /** 簽章（新增/修改時） */
  signature?: string;
  /** 符號類型 */
  type: 'class' | 'function' | 'interface' | 'type' | 'factory';
}

/** 增量快照差異 */
export interface SnapshotDeltaData {
  /** 新增的內容 */
  added: {
    modules: Record<string, ModuleSnapshotData>;
    symbols: DeltaSymbolData[];
  };
  /** 修改的內容 */
  modified: {
    modules: string[];
    symbols: DeltaSymbolData[];
  };
  /** 刪除的內容 */
  removed: {
    modules: string[];
    symbols: DeltaSymbolData[];
  };
}

/** 增量快照資料 */
export interface IncrementalSnapshotData {
  /** 當前版本時間戳 */
  version: string;
  /** 基準版本時間戳（首次為空） */
  baseVersion: string;
  /** 變更內容 */
  delta: SnapshotDeltaData;
}

/** Snapshot 結果 */
export interface SnapshotResult extends QueryResult {
  command: QueryCommand.Snapshot;
  /** 快照類型 */
  snapshotType: 'module' | 'project' | 'incremental';
  /** 快照資料 */
  snapshot: ModuleSnapshotData | ProjectSnapshotData | IncrementalSnapshotData;
}

// ========== FindReferences 結果 ==========

/** 引用類型 */
export type ReferenceType = 'definition' | 'usage' | 'import' | 'export';

/** 引用項目 */
export interface ReferenceItem {
  /** 檔案路徑 */
  file: string;
  /** 行號 */
  line: number;
  /** 欄位 */
  column?: number;
  /** 引用類型 */
  type: ReferenceType;
  /** 上下文程式碼片段 */
  context: string;
}

/** 符號定義位置 */
export interface DefinitionLocation {
  /** 檔案路徑 */
  file: string;
  /** 行號 */
  line: number;
  /** 欄位 */
  column: number;
}

/** FindReferences 結果 */
export interface FindReferencesResult extends QueryResult {
  command: QueryCommand.FindReferences;
  /** 符號名稱 */
  symbol: string;
  /** 符號類型 */
  type: string;
  /** 定義位置（找不到時為 null）- 單一定義時使用 */
  definition: DefinitionLocation | null;
  /** 所有定義位置（多個同名符號時使用） */
  definitions?: DefinitionLocation[];
  /** 所有引用 */
  references: ReferenceItem[];
}

// ========== CallHierarchy 結果 ==========

/** 呼叫層次分析方向 */
export type CallHierarchyDirection = 'incoming' | 'outgoing' | 'both';

/** 呼叫者項目（誰呼叫了目標函數） */
export interface IncomingCallItem {
  /** 呼叫者函數名稱 */
  caller: string;
  /** 呼叫點所在檔案 */
  file: string;
  /** 呼叫點行號 */
  line: number;
  /** 呼叫點欄位 */
  column?: number;
  /** 程式碼上下文 */
  context?: string;
}

/** 被呼叫者項目（目標函數呼叫了誰） */
export interface OutgoingCallItem {
  /** 被呼叫的函數名稱 */
  callee: string;
  /** 被呼叫函數所在檔案 */
  file: string;
  /** 呼叫點行號 */
  line: number;
  /** 呼叫點欄位 */
  column?: number;
  /** 程式碼上下文 */
  context?: string;
}

/** 函數定義資訊（用於多定義場景） */
export interface FunctionDefinitionInfo {
  /** 定義所在檔案 */
  file: string;
  /** 定義行號 */
  line: number;
  /** 所屬類別名稱（若為方法） */
  className?: string;
}

/** CallHierarchy 結果 */
export interface CallHierarchyResult extends QueryResult {
  command: QueryCommand.CallHierarchy;
  /** 目標函數名稱 */
  function: string;
  /** 目標函數定義所在檔案 */
  file: string;
  /** 目標函數定義行號 */
  definitionLine?: number;
  /** 所有定義位置（多個同名函數時使用） */
  definitions?: FunctionDefinitionInfo[];
  /** 分析方向 */
  direction: CallHierarchyDirection;
  /** 分析深度 */
  depth: number;
  /** 呼叫者列表（誰呼叫了此函數） */
  incoming: IncomingCallItem[];
  /** 被呼叫者列表（此函數呼叫了誰） */
  outgoing: OutgoingCallItem[];
}

// ========== DeadCode 結果 ==========

/** Dead Code 項目 */
export interface DeadCodeResultItem {
  /** 符號名稱 */
  name: string;
  /** 符號類型 */
  type: string;
  /** 檔案路徑 */
  file: string;
  /** 行號 */
  line: number;
  /** 欄位 */
  column?: number;
  /** 原因說明 */
  reason: string;
}

/** DeadCode 結果 */
export interface DeadCodeResult extends QueryResult {
  command: QueryCommand.Analyze;
  /** 分析類型 */
  analyzeType: AnalyzeType.DeadCode;
  /** Dead code 項目列表 */
  items: DeadCodeResultItem[];
  /** 按類型統計 */
  byType: Record<string, number>;
  /** 影響的檔案數 */
  filesAffected: number;
  /** 掃描耗時（毫秒） */
  scanTime: number;
  /** 跳過的檔案數（解析失敗） */
  skippedFiles: number;
}
