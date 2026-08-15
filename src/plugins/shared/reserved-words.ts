/**
 * ECMAScript 值空間保留字（TS/JS 共用單一來源）
 *
 * 「值空間保留字」＝不能當變數／函式／參數名稱的字。TypeScript 額外的
 * contextual keyword（`type`、`namespace`、`get`、`string`…）只在特定語法位置
 * 才有特殊意義，在值空間仍是合法識別符，故不列入此集合——需要「TS 型別空間
 * 也一併避開」的判定請用 @plugins/typescript/types.js 的 isTypeScriptReservedWord。
 */

/** ECMAScript 保留字（含 strict mode 保留字與字面值關鍵字） */
export const VALUE_SPACE_RESERVED_WORDS: ReadonlySet<string> = new Set([
  // JavaScript reserved words
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'finally', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
  'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  // ES6+
  'let', 'static', 'await',
  // Strict mode reserved words
  'implements', 'interface', 'package', 'private', 'protected', 'public',
  // Literals
  'null', 'true', 'false'
]);

/** 判定名稱是否為值空間保留字（不能用作變數／函式／參數名） */
export function isValueSpaceReservedWord(name: string): boolean {
  return VALUE_SPACE_RESERVED_WORDS.has(name);
}

/**
 * rename 額外必須避開的 module 語法 contextual keyword。
 *
 * rename 會改寫 import/export specifier（`import { x as y }`、`export { x } from '...'`、
 * `import type { x }`），這些位置上 `as`／`from`／`type` 具語法意義，符號改名成它們會
 * 產生歧義或無效語法。值空間本身合法，故不屬 VALUE_SPACE_RESERVED_WORDS。
 */
export const MODULE_SYNTAX_CONTEXTUAL_KEYWORDS: ReadonlySet<string> = new Set(['as', 'from', 'type']);

/**
 * strict mode／ESM 下禁止作為 binding 名稱的識別符。
 *
 * `eval`、`arguments` 在非嚴格模式下是合法識別符，故不屬 VALUE_SPACE_RESERVED_WORDS；
 * 但 strict mode（含所有 ESM 模組，本專案 rename 目標必屬此類）明文禁止把它們
 * 當作變數／函式／參數等 binding 名稱，屬額外情境限定，與 MODULE_SYNTAX_CONTEXTUAL_KEYWORDS 同層設計。
 */
export const STRICT_MODE_FORBIDDEN_BINDING_NAMES: ReadonlySet<string> = new Set(['eval', 'arguments']);

/** 判定名稱是否不適合作為 rename 的新名稱（值空間保留字、module 語法 contextual keyword，或 strict mode 禁用 binding 名） */
export function isRenameUnsafeIdentifier(name: string): boolean {
  return isValueSpaceReservedWord(name)
    || MODULE_SYNTAX_CONTEXTUAL_KEYWORDS.has(name)
    || STRICT_MODE_FORBIDDEN_BINDING_NAMES.has(name);
}
