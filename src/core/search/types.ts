/**
 * Search 模組型別定義
 * 定義搜尋相關的所有介面和型別
 */

import type { Position, Range } from '@shared/types/index.js';
import type { Symbol, SymbolType } from '@shared/types/index.js';

// ===== 基礎搜尋類型 =====

/**
 * 搜尋結果
 */
export interface SearchResult {
  /** 匹配項目列表 */
  matches: Match[];
  /** 總匹配數量 */
  totalCount: number;
  /** 搜尋耗時（毫秒） */
  searchTime: number;
  /** 結果是否被截斷 */
  truncated: boolean;
}

/**
 * 單個匹配項目
 */
export interface Match {
  /** 檔案路徑 */
  file: string;
  /** 行號 */
  line: number;
  /** 欄位 */
  column: number;
  /** 匹配內容 */
  content: string;
  /** 匹配上下文 */
  context: MatchContext;
  /** 相關性分數 */
  score: number;
  /** 匹配長度 */
  length: number;
  /** 匹配範圍 */
  range: Range;
}

/**
 * 匹配上下文
 */
export interface MatchContext {
  /** 前幾行內容 */
  before: string[];
  /** 後幾行內容 */
  after: string[];
  /** 所在函式名稱 */
  function?: string;
  /** 所在類別名稱 */
  class?: string;
  /** 所在作用域 */
  scope?: string;
}

// ===== 搜尋選項 =====

/**
 * 基礎搜尋選項
 */
export interface SearchOptions {
  /** 搜尋範圍 */
  scope: SearchScope;
  /** 包含的檔案模式 */
  includeFiles?: string[];
  /** 排除的檔案模式 */
  excludeFiles?: string[];
  /** 最大結果數量 */
  maxResults?: number;
  /** 搜尋超時時間（毫秒） */
  timeout?: number;
  /** 是否使用索引 */
  useIndex?: boolean;
  /** 是否顯示上下文 */
  showContext?: boolean;
  /** 上下文行數 */
  contextLines?: number;
}

/**
 * 文字搜尋選項
 */
export interface TextSearchOptions extends SearchOptions {
  /** 大小寫敏感 */
  caseSensitive?: boolean;
  /** 全字匹配 */
  wholeWord?: boolean;
  /** 正則表達式 */
  regex?: boolean;
  /** 多行匹配 */
  multiline?: boolean;
  /** 模糊匹配 */
  fuzzy?: boolean;
  /** 反向搜尋（排除） */
  invert?: boolean;
}

/**
 * 符號搜尋選項
 */
export interface SymbolSearchOptions extends SearchOptions {
  /** 符號類型過濾 */
  symbolTypes?: SymbolType[];
  /** 修飾符過濾 */
  modifiers?: string[];
  /** 是否包含私有符號 */
  includePrivate?: boolean;
  /** 是否包含測試檔案 */
  includeTests?: boolean;
}

/**
 * 模式搜尋選項
 */
export interface PatternSearchOptions extends SearchOptions {
  /** 目標語言 */
  language?: string;
  /** 是否深度匹配 */
  deepMatch?: boolean;
}

// ===== 搜尋範圍 =====

/**
 * 搜尋範圍
 */
export interface SearchScope {
  /** 範圍類型 */
  type: 'file' | 'directory' | 'project' | 'workspace';
  /** 路徑 */
  path?: string;
  /** 是否遞迴 */
  recursive?: boolean;
  /** 最大深度 */
  maxDepth?: number;
}

// ===== 查詢類型 =====

/**
 * 基礎查詢
 */
export interface SearchQuery {
  /** 搜尋類型 */
  type: SearchType;
  /** 查詢字串 */
  query: string;
  /** 搜尋選項 */
  options?: SearchOptions;
}

/**
 * 文字查詢
 */
export interface TextQuery extends SearchQuery {
  type: 'text';
  options?: TextSearchOptions;
}

/**
 * 符號查詢
 */
export interface SymbolQuery extends SearchQuery {
  type: 'symbol';
  /** 符號名稱 */
  name?: string;
  /** 符號類型 */
  symbolType?: SymbolType;
  /** 修飾符 */
  modifiers?: string[];
  /** 搜尋範圍 */
  scope?: SearchScope;
  options?: SymbolSearchOptions;
}

/**
 * 程式碼模式查詢
 */
export interface CodePattern {
  /** 模式類型 */
  type: 'ast' | 'regex' | 'template';
  /** 模式內容 */
  pattern: string | ASTPattern;
  /** 語言 */
  language?: string;
}

/**
 * AST 模式
 */
export interface ASTPattern {
  /** 節點類型 */
  nodeType: string;
  /** 節點屬性 */
  properties?: Record<string, any>;
  /** 子節點模式 */
  children?: ASTPattern[];
}

/**
 * 模式查詢
 */
export interface PatternQuery extends SearchQuery {
  type: 'pattern';
  /** 程式碼模式 */
  pattern: CodePattern;
  options?: PatternSearchOptions;
}

// ===== 搜尋類型 =====

/**
 * 搜尋類型枚舉
 */
// 搜尋類型枚舉
export const SearchType = {
  TEXT: 'text',
  SYMBOL: 'symbol',
  PATTERN: 'pattern',
  SEMANTIC: 'semantic',
  REGEX: 'regex' // 新增 REGEX 類型
} as const;

export type SearchType = typeof SearchType[keyof typeof SearchType];

// ===== 特殊搜尋結果 =====

/**
 * 符號搜尋結果
 */
export interface SymbolSearchResult extends SearchResult {
  /** 找到的符號列表 */
  symbols: Symbol[];
  /** 按類型分組的符號 */
  symbolsByType: Map<SymbolType, Symbol[]>;
}

/**
 * 語義搜尋結果
 */
export interface SemanticSearchResult extends SearchResult {
  /** 搜尋建議 */
  suggestions: string[];
  /** 相關符號 */
  relatedSymbols: Symbol[];
  /** 信心度 */
  confidence: number;
}

/**
 * 模式搜尋結果
 */
export interface PatternSearchResult extends SearchResult {
  /** 匹配的 AST 節點 */
  nodes: PatternMatch[];
}

/**
 * 模式匹配項目
 */
export interface PatternMatch extends Match {
  /** 匹配的 AST 節點 */
  node: any;
  /** 節點路徑 */
  nodePath: string[];
}

// ===== 批次搜尋 =====

/**
 * 批次搜尋結果
 */
export interface BatchSearchResult {
  /** 各個搜尋的結果 */
  results: SearchResult[];
  /** 總耗時 */
  totalTime: number;
  /** 是否全部成功 */
  allSucceeded: boolean;
}

// ===== 搜尋建議 =====

/**
 * 搜尋建議
 */
export interface SearchSuggestion {
  /** 建議文字 */
  text: string;
  /** 建議類型 */
  type: 'completion' | 'correction' | 'history' | 'context';
  /** 相關性分數 */
  score: number;
  /** 描述 */
  description?: string;
}

/**
 * 搜尋上下文
 */
export interface SearchContext {
  /** 當前檔案 */
  currentFile?: string;
  /** 當前符號 */
  currentSymbol?: Symbol;
  /** 最近搜尋 */
  recentSearches?: string[];
  /** 工作目錄 */
  workingDirectory?: string;
}

// ===== 錯誤處理 =====

/**
 * 搜尋錯誤
 */
export class SearchError extends Error {
  constructor(
    message: string,
    public readonly code: SearchErrorCode,
    public readonly query?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

/**
 * 搜尋錯誤代碼
 */
export enum SearchErrorCode {
  QUERY_PARSE_ERROR = 'QUERY_PARSE_ERROR',
  SEARCH_TIMEOUT = 'SEARCH_TIMEOUT',
  INDEX_NOT_AVAILABLE = 'INDEX_NOT_AVAILABLE',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PATTERN_INVALID = 'PATTERN_INVALID',
  REGEX_INVALID = 'REGEX_INVALID',
  MEMORY_EXCEEDED = 'MEMORY_EXCEEDED'
}

// ===== 索引相關 =====

/**
 * 搜尋索引介面
 */
export interface SearchIndex {
  /** 索引名稱 */
  name: string;
  /** 是否準備就緒 */
  ready: boolean;
  /** 最後更新時間 */
  lastUpdated: Date;
  /** 索引大小（檔案數量） */
  size: number;
}

/**
 * 全文索引
 */
export interface FullTextIndex extends SearchIndex {
  /** 搜尋文字 */
  search(query: string, options?: TextSearchOptions): Promise<Match[]>;
  /** 添加文件 */
  addDocument(filePath: string, content: string): Promise<void>;
  /** 移除文件 */
  removeDocument(filePath: string): Promise<void>;
  /** 更新文件 */
  updateDocument(filePath: string, content: string): Promise<void>;
}

/**
 * 符號索引
 */
export interface SymbolIndex extends SearchIndex {
  /** 搜尋符號 */
  searchSymbols(query: SymbolQuery): Promise<Symbol[]>;
  /** 添加符號 */
  addSymbols(filePath: string, symbols: Symbol[]): Promise<void>;
  /** 移除符號 */
  removeSymbols(filePath: string): Promise<void>;
}

// ===== 搜尋統計 =====

/**
 * 搜尋統計
 */
export interface SearchStats {
  /** 總搜尋次數 */
  totalSearches: number;
  /** 平均搜尋時間 */
  averageSearchTime: number;
  /** 快取命中率 */
  cacheHitRate: number;
  /** 最常搜尋的查詢 */
  topQueries: Array<{ query: string; count: number }>;
  /** 最近搜尋 */
  recentSearches: Array<{ query: string; timestamp: Date }>;
}