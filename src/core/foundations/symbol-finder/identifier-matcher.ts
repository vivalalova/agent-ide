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

/** 預編譯的單一字元判定：`char` 是否屬於識別符後續字元（含 ASCII 字母/數字/底線與 Unicode 識別符字元） */
const IDENTIFIER_CONTINUE_REGEX = new RegExp(`^${IDENTIFIER_CONTINUE_CLASS}$`, 'u');

/**
 * 判斷單一字元是否為識別符後續字元（UAX #31 ID_Continue + `$`）。
 * ID_Continue 已涵蓋 ASCII 字母、數字（Nd）與底線（Pc），故此判定對 ASCII 與
 * Unicode 識別符字元（如 `使用者`、`数量`）皆正確，可取代僅認得 ASCII 的
 * `/[A-Za-z0-9_$]/` 寫法。
 *
 * @param char 單一字元；空字串或 undefined 回傳 false
 */
export function isIdentifierContinueChar(char: string | undefined): boolean {
  return char !== undefined && char.length > 0 && IDENTIFIER_CONTINUE_REGEX.test(char);
}

/**
 * 逸出正則表達式特殊字元
 * export 供任何需要把任意字面文字（如類別名稱、識別符）安全內嵌進
 * `new RegExp(...)` 的呼叫端重用，避免各自另寫一份同款跳脫邏輯
 * （見 file-change-preparer.ts 的 findClassInsertPosition：類別名稱含
 * 正則特殊字元如 `$Target` 時，未跳脫的 `new RegExp` 會比對失敗）。
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 建立比對「完整識別符出現位置」的正則表達式（Unicode 邊界感知）。
 *
 * @param symbolName 目標識別符名稱（會自動逸出正則特殊字元）
 * @param flags 額外的 regex flags（`u` 會自動補上）
 */
export function createIdentifierBoundaryRegex(symbolName: string, flags = ''): RegExp {
  if (symbolName.length === 0) {
    throw new Error('symbolName 不能為空字串：空字串會產生零寬度比對，在全域旗標下以 exec() 手動迴圈比對會導致無窮迴圈');
  }

  const escaped = escapeRegex(symbolName);
  const withUnicode = flags.includes('u') ? flags : `${flags}u`;
  return new RegExp(
    `(?<!${IDENTIFIER_CONTINUE_CLASS})${escaped}(?!${IDENTIFIER_CONTINUE_CLASS})`,
    withUnicode
  );
}
