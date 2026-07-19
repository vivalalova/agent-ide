/**
 * 正則表達式共用工具
 */

/**
 * 逸出正則表達式特殊字元，將任意字面文字安全內嵌進 `new RegExp(...)`。
 * 全域唯一來源：任何需要跳脫正則特殊字元的呼叫端皆應引用此函式，禁另行複製同款實作。
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
