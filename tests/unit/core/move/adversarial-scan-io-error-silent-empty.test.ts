/**
 * P2: findAffectedFilesForPaths()（file-scanner.ts 約 163-180 行）把讀取候選
 * 檔案內容時遇到的任何錯誤（含權限不足等真正的 I/O 錯誤）一律 catch 後轉成
 * `content: null`，下面 178-181 行 `if (content === null) { continue; }`
 * 直接跳過，等同把「讀取失敗」偽裝成「這個檔案沒有任何 import」。
 *
 * 具體重現：consumer.ts import 了即將被移動的 target.ts，但掃描階段對
 * consumer.ts 的 readFile 拋出 EACCES（權限不足）。目前行為：move 完全忽略
 * 這個讀取失敗，當作 consumer.ts 沒有引用 target.ts，實際移動仍會回報成功
 * ——結果 consumer.ts 的 import 靜默留在指向已搬移的舊路徑，造成資料不一致
 * 卻對外宣告成功。依本專案 fast-fail 慣例，非「檔案不存在」的讀取失敗必須
 * 讓錯誤往外拋，中止整個 move（或至少讓呼叫端能明確得知失敗），而不是
 * 靜默當成「沒有引用」繼續執行。
 *
 * 對照組：target.ts 本身如果在掃描與讀取之間已經不存在（FileNotFoundError／
 * ENOENT），屬於合理的空結果（候選檔案已被刪除/搬移，本來就沒有內容可比對），
 * 不應被誤判成需要中止的錯誤——這是本測試檔第二個案例要驗證的行為不能被破壞。
 */
import { describe, expect, it } from 'vitest';
import { FileScanner } from '@core/move/file-scanner.js';
import { PathCalculator } from '@core/move/path-calculator.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS } from '@core/move/path-utils.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

/**
 * 包裝一個 MemFileSystem，讓對指定檔案的 readFile 拋出一個非「檔案不存在」
 * 的錯誤（模擬真實檔案系統中 EACCES 權限不足），其餘方法透明轉發。
 */
function createReadFailureFileSystem(inner: MemFileSystem, blockedFile: string): IFileSystem {
  const wrapped = Object.create(inner) as MemFileSystem;
  wrapped.readFile = async (filePath: string, encoding?: BufferEncoding) => {
    if (filePath === blockedFile) {
      throw new Error(`EACCES: permission denied, open '${filePath}'`);
    }
    return inner.readFile(filePath, encoding);
  };
  return wrapped as unknown as IFileSystem;
}

describe('掃描階段讀取失敗不應被靜默當成「沒有引用」（adversarial scan-io-error）', () => {
  it('consumer.ts 讀取遇到權限錯誤時，move 應該失敗而非靜默略過該檔案的引用', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/proj/src/target.ts': 'export const value = 1;\n',
      '/proj/src/consumer.ts': 'import { value } from \'./target\';\nexport const used = value;\n'
    });
    const fileSystem = createReadFailureFileSystem(memfs, '/proj/src/consumer.ts');
    const resolver = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ALLOWED_EXTENSIONS
    });
    const scanner = new FileScanner(fileSystem, resolver);

    // 正確行為：讀取失敗應該讓錯誤往外拋，而不是回傳「沒有受影響檔案」。
    await expect(
      scanner.findAffectedFiles('/proj/src/target.ts', '/proj/src')
    ).rejects.toThrow(/EACCES|permission/i);
  });

  it('對照組：候選檔案在掃描時已不存在（ENOENT）仍應視為合理空結果，不應拋錯', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/proj/src/target.ts': 'export const value = 1;\n',
      '/proj/src/consumer.ts': 'import { value } from \'./target\';\nexport const used = value;\n'
    });
    const fileSystem = createReadFailureFileSystem(memfs, '/proj/src/consumer.ts');
    // 覆寫成 ENOENT 型態錯誤（檔案不存在，屬於合理的空結果）
    const wrapped = fileSystem as unknown as { readFile: MemFileSystem['readFile'] };
    const originalReadFile = wrapped.readFile;
    wrapped.readFile = async (filePath: string, encoding?: BufferEncoding) => {
      if (filePath === '/proj/src/consumer.ts') {
        const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return originalReadFile(filePath, encoding);
    };

    const resolver = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ALLOWED_EXTENSIONS
    });
    const scanner = new FileScanner(fileSystem, resolver);

    await expect(
      scanner.findAffectedFiles('/proj/src/target.ts', '/proj/src')
    ).resolves.toEqual([]);
  });

  it('calculatePathUpdates 對 affected 檔案的第二次讀取遇到權限錯誤時也應拋錯，而非回傳空更新', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/proj/src/target.ts': 'export const value = 1;\n',
      '/proj/src/consumer.ts': 'import { value } from \'./target\';\nexport const used = value;\n'
    });
    const fileSystem = createReadFailureFileSystem(memfs, '/proj/src/consumer.ts');
    const resolver = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ALLOWED_EXTENSIONS
    });
    const calc = new PathCalculator(fileSystem, resolver);

    await expect(
      calc.calculatePathUpdates(
        '/proj/src/consumer.ts',
        '/proj/src/target.ts',
        '/proj/src/moved-target.ts'
      )
    ).rejects.toThrow(/EACCES|permission/i);
  });
});
