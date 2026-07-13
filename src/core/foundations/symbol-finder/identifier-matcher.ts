/**
 * 識別符邊界比對工具
 *
 * 取代 `\b<name>\b`：JS 正則的 `\b` 以 ASCII `\w`（[A-Za-z0-9_]）定義邊界，對純 Unicode
 * 識別符（如 `用戶`、`数量`）失效——當名稱前後皆為非 `\w` 字元時，`\b用戶\b` 兩端都不成立、
 * 完全比對不到（缺陷 G6）。
 *
 * 改以「前後字元不屬於識別符後續字元集合」的 lookaround 判定邊界，涵蓋所有語言的識別符，
 * 對 ASCII 名稱與原 `\b` 行為等價、對 Unicode 名稱正確。識別符字元類鏡射
 * plugins/shared/parser-helpers.ts 的 UNICODE_IDENTIFIER_PATTERN（UAX #31 ID_Continue，
 * 加 JS 慣例的 `$`）；因架構限制 core 不可直接依賴 plugins（見 src/core/move/import-resolver.ts
 * 同款註解），此處本地定義同語意字元類。
 */

/** 識別符後續字元類（UAX #31 ID_Continue + `$`），與 plugins/shared 的 UNICODE_IDENTIFIER_PATTERN 對齊 */
const IDENTIFIER_CONTINUE_CLASS = '[\\p{ID_Continue}$]';

/** 逸出正則表達式特殊字元 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 建立比對「完整識別符出現位置」的正則表達式（Unicode 邊界感知）。
 *
 * @param symbolName 目標識別符名稱（會自動逸出正則特殊字元）
 * @param flags 額外的 regex flags（`u` 會自動補上）
 */
export function createIdentifierBoundaryRegex(symbolName: string, flags = ''): RegExp {
  const escaped = escapeRegex(symbolName);
  const withUnicode = flags.includes('u') ? flags : `${flags}u`;
  return new RegExp(
    `(?<!${IDENTIFIER_CONTINUE_CLASS})${escaped}(?!${IDENTIFIER_CONTINUE_CLASS})`,
    withUnicode
  );
}
