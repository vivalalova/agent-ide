/**
 * Import specifier 的 module 身分解析（move-member 目標檔 import 判重用）
 *
 * 判重不能比 specifier 的字面文字，必須比「這個 specifier 寫進某個檔案後實際解析到哪個
 * 檔案」。字面正規化做不到：`./s`／`./s.js`／`./s/index.js` 可能是同一模組（不合併會插出
 * 重複 binding），但 `./foo.ts` 與 `./foo/index.ts` 並存的歧義佈局下 `./foo` 依 TypeScript
 * 解析順序指向 `./foo.ts`，剝副檔名／剝 `/index` 會把兩個不同模組誤判等價，靜默吞掉該插的
 * import、讓搬進來的成員綁到錯誤來源。
 */

import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  resolveProjectImportCandidates,
  resolveExistingProjectFile
} from '@core/foundations/index.js';

/**
 * 建立以 containerFile 為解析基準的專案檔案解析器：回傳的函式把 specifier 映射成它在該
 * 檔案語境下實際指向的專案檔案絕對路徑，解析不到時回傳 null。判重（見
 * createModuleIdentityResolver）與「把來源檔語境的相對 specifier 換算到目標檔語境」
 * （move-member 跨目錄搬移）共用同一份解析語意，不各自實作。
 *
 * 候選順序與存在性判斷委派 resolveProjectImportCandidates / resolveExistingProjectFile
 * （SSOT，TypeScript 語意：全部 direct 副檔名優先於任何 index 檔）；存在性 predicate 必須
 * 同時檢查 isFile，否則 `./dir` 的首個候選（既存目錄本身）會短路命中而拿不到真正的
 * `./dir/index.ts`。解析一律經注入的 fileSystem（測試為 memfs），不可用 node:fs。
 *
 * 解析結果快取在解析器實例內、不跨實例共用：呼叫端每次搬移操作各建一個，避免前一次搬移
 * 已改變檔案系統後仍讀到過期的解析結果。
 */
export function createProjectFileResolver(
  fileSystem: IFileSystem,
  containerFile: string
): (moduleSpecifier: string) => Promise<string | null> {
  const cache = new Map<string, Promise<string | null>>();

  const resolve = (moduleSpecifier: string): Promise<string | null> =>
    resolveExistingProjectFile(
      resolveProjectImportCandidates(moduleSpecifier, containerFile),
      async candidate => await fileSystem.exists(candidate) && await fileSystem.isFile(candidate)
    );

  return (moduleSpecifier: string): Promise<string | null> => {
    const cached = cache.get(moduleSpecifier);
    if (cached) { return cached; }
    const pending = resolve(moduleSpecifier);
    cache.set(moduleSpecifier, pending);
    return pending;
  };
}

/**
 * 建立以 containerFile 為解析基準的 module 身分解析器：回傳的函式把 specifier 映射成
 * 可直接相等比較的身分 key。同一個 containerFile 語境下的所有 specifier（既有 import 與
 * 待插入 import）都必須經同一個解析器，才是在同一語境下比較。
 *
 * 解析不到（檔案不存在、bare package、未設定的 path alias）時 fallback 到**字面** specifier
 * （不剝副檔名、不剝 `/index`）：同一檔案內字面全等的 specifier 必然是同一模組，故 bare
 * package（如 `lodash.merge`）等外部依賴的判重仍成立；任何字面差異則視為不同模組——寧可
 * 不合併（響亮的 duplicate binding，編譯期即報錯）也不誤合併（靜默綁錯來源）。key 前綴
 * 區隔「已解析檔案」與「字面」兩種空間，避免兩者碰撞。
 */
export function createModuleIdentityResolver(
  fileSystem: IFileSystem,
  containerFile: string
): (moduleSpecifier: string) => Promise<string> {
  const resolveFile = createProjectFileResolver(fileSystem, containerFile);

  return async (moduleSpecifier: string): Promise<string> => {
    const resolvedFile = await resolveFile(moduleSpecifier);
    return resolvedFile
      ? `file:${resolvedFile}`
      : `literal:${moduleSpecifier.replace(/\\/g, '/')}`;
  };
}
