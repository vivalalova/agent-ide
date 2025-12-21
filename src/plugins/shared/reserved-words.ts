/**
 * 語言保留字定義
 *
 * JavaScript 和 TypeScript 的保留字集合。
 * TypeScript 保留字包含 JavaScript 保留字並添加 TypeScript 特有的關鍵字。
 */

/**
 * JavaScript 基礎保留字
 *
 * 包含：
 * - ECMAScript 保留字（break, case, catch, class, const 等）
 * - ES6+ 新增關鍵字（let, static, async, await）
 * - 嚴格模式保留字（implements, interface, package, private, protected, public）
 * - 字面值（null, true, false）
 */
export const JS_RESERVED_WORDS: Set<string> = new Set([
  // ECMAScript 保留字
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
  'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  // ES6+
  'let', 'static', 'async', 'await',
  // 嚴格模式保留字
  'implements', 'interface', 'package', 'private', 'protected', 'public',
  // 字面值
  'null', 'true', 'false'
]);

/**
 * TypeScript 額外保留字
 *
 * 繼承 JavaScript 保留字，並添加 TypeScript 特有的關鍵字：
 * - 型別相關（type, enum, namespace, module, declare, abstract）
 * - 型別運算符（as, asserts, infer, is, keyof）
 * - 內建型別（any, boolean, number, string, symbol, object, unknown, never）
 * - 其他關鍵字（constructor, get, set, readonly, require, unique, from, global, of）
 */
export const TS_RESERVED_WORDS: Set<string> = new Set([
  // 繼承 JavaScript 保留字
  ...JS_RESERVED_WORDS,
  // TypeScript 特有關鍵字
  'enum', 'type', 'namespace', 'module', 'declare', 'abstract', 'as',
  'asserts', 'any', 'boolean', 'constructor', 'get', 'infer', 'is',
  'keyof', 'never', 'readonly', 'require', 'number', 'object', 'set',
  'string', 'symbol', 'undefined', 'unique', 'unknown', 'from', 'global',
  'of'
]);
