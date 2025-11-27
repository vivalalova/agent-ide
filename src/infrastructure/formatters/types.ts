/**
 * Preview 輸出格式統一型別定義
 * 所有支援 dry-run 的命令（rename, move, shift, refactor）共用此結構
 */

/** 支援 dry-run 的命令類型 */
export enum PreviewCommand {
  Rename = 'rename',
  Move = 'move',
  Shift = 'shift',
  Refactor = 'refactor'
}

/** 輸出格式類型 */
export enum PreviewFormat {
  Diff = 'diff',
  Json = 'json'
}

/** 變更行類型 */
export enum ChangeLineType {
  Context = 'context',
  Add = 'add',
  Delete = 'delete'
}

/** 單一變更行 */
export interface ChangeLine {
  /** 變更類型 */
  type: ChangeLineType;
  /** 行號 */
  lineNumber: number;
  /** 行內容 */
  content: string;
}

/** Diff hunk（一個變更區塊） */
export interface DiffHunk {
  /** Hunk header（如 @@ -10,7 +10,7 @@） */
  header: string;
  /** 原始起始行號 */
  oldStart: number;
  /** 原始行數 */
  oldCount: number;
  /** 新起始行號 */
  newStart: number;
  /** 新行數 */
  newCount: number;
  /** 變更行列表 */
  lines: ChangeLine[];
}

/** 單一檔案的變更 */
export interface FileChange {
  /** 檔案路徑 */
  filePath: string;
  /** Diff hunks */
  hunks: DiffHunk[];
}

/** Preview 統計摘要 */
export interface PreviewSummary {
  /** 影響的檔案數 */
  totalFiles: number;
  /** 總變更數 */
  totalChanges: number;
  /** 新增行數 */
  additions: number;
  /** 刪除行數 */
  deletions: number;
}

/** 衝突資訊 */
export interface ConflictInfo {
  /** 衝突類型 */
  type: string;
  /** 衝突訊息 */
  message: string;
  /** 衝突位置 */
  filePath: string | null;
  /** 行號 */
  line: number | null;
}

/**
 * 統一的 Preview 結果結構
 * 所有命令的 dry-run 都返回此型別
 */
export interface PreviewResult {
  /** 命令類型 */
  command: PreviewCommand;
  /** 是否成功生成 preview */
  success: boolean;
  /** 檔案變更列表 */
  files: FileChange[];
  /** 統計摘要 */
  summary: PreviewSummary;
  /** 衝突列表（可選） */
  conflicts?: ConflictInfo[];
  /** 錯誤訊息列表（可選） */
  errors?: string[];
}

/** Formatter 選項 */
export interface PreviewFormatterOptions {
  /** 上下文行數（預設 3） */
  contextLines: number;
  /** 是否啟用顏色輸出 */
  color: boolean;
}

/**
 * 用於生成 PreviewResult 的輸入資料
 * Core 模組提供此結構，由 formatter 轉換為 PreviewResult
 */
export interface PreviewInput {
  /** 命令類型 */
  command: PreviewCommand;
  /** 是否成功 */
  success: boolean;
  /** 檔案變更資料 */
  fileChanges: FileChangeInput[];
  /** 衝突列表 */
  conflicts?: ConflictInfo[];
  /** 錯誤訊息 */
  errors?: string[];
}

/** 單一檔案變更的輸入資料 */
export interface FileChangeInput {
  /** 檔案路徑 */
  filePath: string;
  /** 原始檔案內容（用於生成 context） */
  originalContent: string;
  /** 變更列表 */
  changes: LineChange[];
}

/** 單一行變更 */
export interface LineChange {
  /** 行號（1-based） */
  line: number;
  /** 原始內容（null 表示新增） */
  oldContent: string | null;
  /** 新內容（null 表示刪除） */
  newContent: string | null;
}
