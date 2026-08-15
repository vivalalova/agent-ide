/**
 * 錯誤處理工具函式
 */

/**
 * 從未知錯誤中提取錯誤訊息
 *
 * @param error - 任意類型的錯誤
 * @returns 錯誤訊息字串
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 判斷錯誤是否代表「檔案不存在」——可視為合理的空結果（例如候選檔案在
 * 掃描與實際讀取之間已被刪除或移動），呼叫端可安全地跳過該檔案繼續處理。
 *
 * 同時相容兩種來源：
 * - 正式 FileSystem（`infrastructure/storage/file-system.ts`）包出的
 *   `FileNotFoundError`，以 `.name` 識別（該類別未設定 `.code`）
 * - 測試用 MemFileSystem 底層 `@lova/mem-vfs` 拋出的 `FileNotFoundError`，
 *   `.name` 相同但改以 `.code === 'FILE_NOT_FOUND'` 標記，兩者是不同類別、
 *   無共通 instanceof 可用，只能用 `.name` 對齊
 * - 未經包裝、直接來自 Node fs 的原生 ENOENT 錯誤
 *
 * 除此之外的讀取失敗（權限不足、其他 I/O 錯誤）一律視為非預期錯誤，
 * 呼叫端不得靜默吞掉、應讓錯誤往外拋以中止操作。
 */
export function isFileNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === 'FileNotFoundError') {
    return true;
  }
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
