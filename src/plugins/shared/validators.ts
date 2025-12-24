/**
 * Parser 共享驗證邏輯
 */

/**
 * 驗證程式碼和檔案路徑輸入
 */
export function validateParserInput(code: string, filePath: string): void {
  if (!code.trim()) {
    throw new Error('程式碼內容不能為空');
  }
  if (!filePath.trim()) {
    throw new Error('檔案路徑不能為空');
  }
}

/**
 * 驗證重命名輸入
 * @param newName 新名稱
 * @param language 語言類型（用於錯誤訊息）
 * @param isValidIdentifier 識別符驗證函數
 */
export function validateRenameInput(
  newName: string,
  language: 'JavaScript' | 'TypeScript',
  isValidIdentifier: (name: string) => boolean
): void {
  if (!newName.trim()) {
    throw new Error('新名稱不能為空');
  }
  if (!isValidIdentifier(newName)) {
    throw new Error(`新名稱必須是有效的 ${language} 識別符`);
  }
}
