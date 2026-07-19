/**
 * Parser 共用常數
 * TypeScript 和 JavaScript Parser 共享的設定值
 */

import { COMMON_EXCLUDE_DIR_NAMES } from '@shared/exclude-dirs.js';

/**
 * 行號匹配的容差值（允許 JSDoc 造成的偏移）
 * JSDoc 可能跨越多行，因此需要容差來正確匹配目標宣告
 */
export const LINE_TOLERANCE = 10;

/**
 * 通用排除模式（適用於所有語言）
 * 衍生自 @shared/exclude-dirs 的權威目錄名稱清單，轉為 glob pattern 供
 * parser 層以 glob 比對檔案路徑；目錄名稱本身的權威定義不在此複製。
 */
export const COMMON_EXCLUDE_PATTERNS = COMMON_EXCLUDE_DIR_NAMES.map(name => `${name}/**`);

/**
 * TypeScript 特定排除模式
 */
export const TYPESCRIPT_EXCLUDE_PATTERNS = [
  ...COMMON_EXCLUDE_PATTERNS,
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.test.tsx',
  '**/*.spec.tsx',
  '**/*.test.mts',
  '**/*.spec.mts',
  '**/*.test.cts',
  '**/*.spec.cts',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.d.ts',
  '**/*.d.mts',
  '**/*.d.cts'
] as const;

/**
 * JavaScript 特定排除模式
 */
export const JAVASCRIPT_EXCLUDE_PATTERNS = [
  ...COMMON_EXCLUDE_PATTERNS,
  '**/*.test.js',
  '**/*.spec.js',
  '**/*.test.jsx',
  '**/*.spec.jsx',
  '**/*.test.mjs',
  '**/*.spec.mjs',
  '**/*.test.cjs',
  '**/*.spec.cjs',
  '**/__tests__/**',
  '**/__mocks__/**'
] as const;

/**
 * Factory 模式識別的回傳型別排除清單
 * 這些型別不視為 factory 模式的產物
 */
export const NON_FACTORY_RETURN_TYPES = [
  'void',
  'never',
  'string',
  'number',
  'boolean',
  'null',
  'undefined',
  'symbol',
  'bigint'
] as const;

/**
 * Factory 模式函數名稱前綴
 * 符合這些前綴的函數更可能是 factory
 */
export const FACTORY_NAME_PREFIXES = [
  'create',
  'make',
  'build'
] as const;
