/**
 * Core Foundations
 * 核心模組內部共用基礎設施
 *
 * 與 @shared/ (全域 types/errors) 區分：
 * - @core/foundations/: 核心業務邏輯共用工具
 * - @shared/: 全專案共用的型別和錯誤定義
 */

// 索引引擎
export * from './indexing/index.js';

// 依賴圖
export * from './dependency-graph/index.js';

// 符號查找
export * from './symbol-finder/index.js';

// 檔案工具
export * from './file-utils.js';

// 程式碼狀態掃描（括號/引號/註解感知）
export * from './code-state-mask.js';
