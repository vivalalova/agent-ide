/**
 * Import binding 識別鍵
 *
 * 單一權威來源：DeadCodeDetector（產生「檔內未使用的 import binding」候選）與
 * ImportCleaner（比對候選、決定是否清理）都必須用同一把鍵去比對同一個
 * (檔案路徑, local binding 名稱) 組合，禁止兩處各自組字串（分隔字元一旦不一致，
 * 比對就會靜默失效）。
 */

/**
 * 鍵組成分隔字元：選 NUL 字元（\0）——合法檔案路徑與識別符名稱皆不可能
 * 包含 NUL，可完全避免 filePath 與 localBindingName 邊界含糊導致的假碰撞
 * （若改用一般字元如空格，filePath 本身含空格時可能與 name 邊界混淆）。
 */
const KEY_SEPARATOR = '\u0000';

/**
 * 組出 (檔案路徑, local binding 名稱) 的唯一鍵
 * @param filePath import 陳述式所在檔案路徑
 * @param localBindingName 該 binding 在檔案內實際使用的名稱（alias ?? 原名）
 */
export function makeImportBindingKey(filePath: string, localBindingName: string): string {
  return `${filePath}${KEY_SEPARATOR}${localBindingName}`;
}
