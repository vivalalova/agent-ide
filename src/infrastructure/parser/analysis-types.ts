/**
 * 語言無關的分析型別定義
 * 所有 ParserPlugin 檢測方法使用的通用型別
 */

import type { Position, Range, Symbol } from '../../shared/types/index.js';

/**
 * 未使用程式碼
 */
export interface UnusedCode {
  /** 未使用程式碼類型 */
  type: 'variable' | 'function' | 'class' | 'import' | 'unreachable';
  /** 符號名稱（如果適用） */
  name?: string;
  /** 位置資訊 */
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  /** 信心程度（0-1） */
  confidence: number;
  /** 原因說明 */
  reason?: string;
}

/**
 * 複雜度指標
 */
export interface ComplexityMetrics {
  /** 循環複雜度 */
  cyclomaticComplexity: number;
  /** 認知複雜度 */
  cognitiveComplexity: number;
  /** 複雜度評估等級 */
  evaluation: 'simple' | 'moderate' | 'complex' | 'very-complex';
  /** 函式數量 */
  functionCount: number;
  /** 平均複雜度 */
  averageComplexity: number;
  /** 最大複雜度 */
  maxComplexity: number;
  /** 最大複雜度函式名稱 */
  maxComplexityFunction?: string;
}

/**
 * 程式碼片段（用於重複代碼檢測）
 */
export interface CodeFragment {
  /** 片段類型 */
  type: 'method' | 'constant' | 'config' | 'comment';
  /** 原始程式碼 */
  code: string;
  /** Token 序列（用於 Type-2/Type-3 比對） */
  tokens: string[];
  /** 位置資訊 */
  location: {
    filePath: string;
    startLine: number;
    endLine: number;
  };
  /** 雜湊值（用於快速比對） */
  hash: string;
}

/**
 * 重複代碼檢測結果
 */
export interface DuplicationResult {
  /** 重複代碼群組 */
  groups: DuplicationGroup[];
  /** 總重複行數 */
  totalDuplicatedLines: number;
  /** 重複代碼比例 */
  duplicationPercentage: number;
}

/**
 * 重複代碼群組
 */
export interface DuplicationGroup {
  /** 群組 ID */
  id: string;
  /** 重複類型 */
  type: 'type-1' | 'type-2' | 'type-3';
  /** 重複片段列表 */
  fragments: CodeFragment[];
  /** 重複次數 */
  count: number;
  /** 重複行數 */
  lines: number;
}

/**
 * 樣板模式匹配
 */
export interface PatternMatch {
  /** 模式名稱 */
  pattern: string;
  /** 模式類型 */
  type: 'boilerplate' | 'anti-pattern' | 'design-pattern';
  /** 位置資訊 */
  locations: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
  }>;
  /** 出現次數 */
  count: number;
  /** 嚴重程度 */
  severity: 'low' | 'medium' | 'high';
  /** 建議改進方式 */
  suggestion?: string;
}

/**
 * 型別安全問題
 */
export interface TypeSafetyIssue {
  /** 問題類型 */
  type: 'any-type' | 'type-assertion' | 'ignore-directive' | 'unsafe-cast' | 'force-unwrap';
  /** 位置資訊 */
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  /** 問題描述 */
  message: string;
  /** 嚴重程度 */
  severity: 'warning' | 'error';
}

/**
 * 錯誤處理問題
 */
export interface ErrorHandlingIssue {
  /** 問題類型 */
  type: 'empty-catch' | 'silent-error' | 'unhandled-promise' | 'missing-error-handling';
  /** 位置資訊 */
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  /** 問題描述 */
  message: string;
  /** 嚴重程度 */
  severity: 'warning' | 'error';
}

/**
 * 安全性問題
 */
export interface SecurityIssue {
  /** 問題類型 */
  type: 'hardcoded-secret' | 'unsafe-eval' | 'sql-injection' | 'xss-vulnerability' | 'unsafe-api';
  /** 位置資訊 */
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  /** 問題描述 */
  message: string;
  /** 嚴重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 建議修復方式 */
  recommendation?: string;
}

/**
 * 命名規範問題
 */
export interface NamingIssue {
  /** 問題類型 */
  type: 'invalid-naming' | 'inconsistent-style' | 'reserved-keyword' | 'misleading-name';
  /** 符號名稱 */
  symbolName: string;
  /** 符號類型 */
  symbolType: string;
  /** 位置資訊 */
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  /** 問題描述 */
  message: string;
  /** 建議名稱 */
  suggestedName?: string;
}

/**
 * 測試覆蓋率結果
 */
export interface TestCoverageResult {
  /** 測試檔案數量 */
  testFileCount: number;
  /** 總檔案數量 */
  totalFileCount: number;
  /** 測試覆蓋率 */
  coveragePercentage: number;
  /** 測試檔案列表 */
  testFiles: string[];
  /** 未測試檔案列表 */
  untestedFiles: string[];
}
