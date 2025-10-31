/**
 * Snapshot 模組型別定義
 * 提供程式碼快照相關的型別和介面
 */

/**
 * 壓縮層級
 */
export enum CompressionLevel {
  /** 最小化：只包含架構和符號索引 (~20K tokens) */
  Minimal = 'minimal',

  /** 中等：包含符號和簡化的實作 (~35K tokens) */
  Medium = 'medium',

  /** 完整：包含壓縮後的完整實作 (~50K tokens) */
  Full = 'full'
}

/**
 * 快照配置選項
 */
export interface SnapshotOptions {
  /** 專案根目錄路徑 */
  projectPath: string;

  /** 輸出檔案路徑 */
  outputPath?: string;

  /** 壓縮層級 */
  level?: CompressionLevel;

  /** 是否使用增量更新 */
  incremental?: boolean;

  /** 排除模式（glob patterns） */
  exclude?: string[];

  /** 包含的檔案副檔名 */
  extensions?: string[];

  /** 是否包含測試檔案 */
  includeTests?: boolean;

  /** 是否生成多層級快照 */
  multiLevel?: boolean;

  /** 多層級輸出目錄 */
  outputDir?: string;

  /** 是否靜默模式（不輸出進度訊息） */
  silent?: boolean;
}

/**
 * 模組摘要
 */
export interface ModuleSummary {
  /** 模組路徑 */
  p: string;

  /** 匯出符號數量 */
  e: number;

  /** 依賴數量 */
  d: number;

  /** 程式碼行數 */
  l: number;
}

/**
 * 壓縮的符號資訊
 */
export interface CompressedSymbol {
  /** 符號名稱 */
  n: string;

  /** 符號類型（縮寫：f=function, c=class, v=variable, i=interface, t=type, e=enum） */
  t: string;

  /** 起始行號 */
  s: number;

  /** 結束行號 */
  e: number;

  /** 是否匯出 */
  x?: boolean;

  /** 簽章（函式/方法） */
  sg?: string;

  /** 父符號（巢狀符號） */
  p?: string;
}

/**
 * 壓縮的程式碼
 */
export interface CompressedCode {
  /** 壓縮後的程式碼 */
  m: string;

  /** 符號映射表（縮短變數名的映射） */
  sm?: Record<string, string>;

  /** 原始行數 */
  ol?: number;

  /** 壓縮後行數 */
  cl?: number;
}

/**
 * 品質指標
 */
export interface QualityMetrics {
  /** ShitScore 分數 */
  ss: number;

  /** 複雜度 */
  cx: number;

  /** 可維護性 */
  mt: number;

  /** 關鍵問題列表 */
  is: string[];
}

/**
 * 檔案變更類型
 */
export enum FileChangeType {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted'
}

/**
 * 檔案變更記錄
 */
export interface FileChange {
  /** 檔案路徑 */
  path: string;

  /** 變更類型 */
  type: FileChangeType;

  /** 舊 hash（修改或刪除時） */
  oldHash?: string;

  /** 新 hash（新增或修改時） */
  newHash?: string;
}

/**
 * 快照結構
 */
export interface Snapshot {
  /** 快照格式版本 */
  v: string;

  /** 專案名稱 */
  p: string;

  /** 生成時間戳 */
  t: number;

  /** 專案狀態 hash */
  h: string;

  /** 壓縮層級 */
  l: CompressionLevel;

  /** 架構層 */
  s: {
    /** 目錄列表 */
    d: string[];

    /** 模組摘要 */
    m: ModuleSummary[];
  };

  /** 符號索引 */
  y: Record<string, CompressedSymbol[]>;

  /** 依賴關係 */
  dp: {
    /** 依賴邊列表 [from, to] */
    g: [string, string][];

    /** 檔案的 import 列表 */
    i: Record<string, string[]>;

    /** 檔案的 export 列表 */
    ex: Record<string, string[]>;
  };

  /** 程式碼內容 */
  c: Record<string, CompressedCode>;

  /** 品質指標 */
  q: QualityMetrics;

  /** 增量更新元數據 */
  md: {
    /** 檔案 hash 映射 */
    fh: Record<string, string>;

    /** 總檔案數 */
    tf: number;

    /** 總程式碼行數 */
    tl: number;

    /** 使用的語言 */
    lg: string[];
  };
}

/**
 * 快照差異
 */
export interface SnapshotDiff {
  /** 新增的檔案 */
  added: string[];

  /** 修改的檔案 */
  modified: string[];

  /** 刪除的檔案 */
  deleted: string[];

  /** 變更摘要 */
  summary: {
    totalChanges: number;
    filesAffected: number;
    linesChanged: number;
  };
}

/**
 * 快照統計資訊
 */
export interface SnapshotStats {
  /** 檔案數量 */
  fileCount: number;

  /** 總程式碼行數 */
  totalLines: number;

  /** 符號總數 */
  symbolCount: number;

  /** 依賴關係數 */
  dependencyCount: number;

  /** 估計 token 數 */
  estimatedTokens: number;

  /** 壓縮比例 */
  compressionRatio: number;

  /** 生成耗時（毫秒） */
  generationTime: number;
}

/**
 * 建立預設的快照選項
 */
export function createDefaultSnapshotOptions(projectPath: string): SnapshotOptions {
  return {
    projectPath,
    level: CompressionLevel.Full,
    incremental: false,
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.test.*',
      '*.spec.*',
      '**/fixtures/**',
      '**/__tests__/**',
      '**/__mocks__/**',
      '.git/**',
      'coverage/**'
    ],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
    includeTests: false,
    multiLevel: false
  };
}

/**
 * 型別守衛：檢查是否為有效的快照
 */
export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.v === 'string' &&
    typeof obj.p === 'string' &&
    typeof obj.t === 'number' &&
    typeof obj.h === 'string' &&
    typeof obj.l === 'string' &&
    typeof obj.s === 'object' &&
    typeof obj.y === 'object' &&
    typeof obj.dp === 'object' &&
    typeof obj.c === 'object' &&
    typeof obj.q === 'object' &&
    typeof obj.md === 'object'
  );
}

/**
 * 計算快照大小（估計 token 數）
 */
export function estimateSnapshotTokens(snapshot: Snapshot): number {
  const jsonStr = JSON.stringify(snapshot);
  // 粗略估計：每 4 個字元約等於 1 個 token
  return Math.ceil(jsonStr.length / 4);
}
