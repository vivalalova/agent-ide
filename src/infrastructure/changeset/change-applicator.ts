/**
 * 變更應用器
 * 負責將變更集應用到檔案系統，支援 dry-run、備份、回滾
 */

import { resolve as pathResolve } from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  FileOperationType,
  BackupType,
  type Changeset,
  type FileTextChange,
  type FileOperation,
  type ApplyResult,
  type ApplyOptions,
  type BackupEntry
} from './types.js';
import { applyTextEdits } from './apply-text-edits.js';
import { getErrorMessage } from '@shared/errors/index.js';

/**
 * 目前 process 內正在被某個 apply() 呼叫獨佔處理的檔案路徑集合。
 *
 * 模組層級（非 instance 層級）：CLI 各命令進入點都各自 `new ChangeApplicator(...)`
 * （見 move.command.ts、move-glob-command-handler.ts、command-utils.ts、
 * move-member-engine.ts），若鎖存在 instance 上將無法防止「不同 ChangeApplicator
 * 實例、同一 process 內」併發套用同一檔案。
 *
 * 僅作為 in-process 互斥用，防止同 process 內併發 apply() 互踩（Bug B：
 * 兩個併發呼叫都讀到同一份原始內容、各自算出不同結果、最後寫入者靜默蓋掉前者）；
 * 不處理跨 process／跨機器的併發（scope 外）。
 *
 * 路徑一律以 path.resolve 正規化後再入 Set，避免 `./a.ts` 與絕對路徑被當成不同檔。
 */
const filesInFlight = new Set<string>();

/**
 * 將路徑 canonicalize 為絕對、正規化形式，供 filesInFlight 互斥 key 使用。
 * 語意同一檔、字串不同（如 `/a/../a/b.ts` 與 `/a/b.ts`）必須對到同一 key。
 */
function canonicalizePath(filePath: string): string {
  return pathResolve(filePath);
}

/**
 * 收集一個 changeset 會實際觸及（讀取備份／寫入）的所有檔案路徑，供併發鎖使用。
 * 涵蓋文字變更的 filePath，以及檔案操作的 sourcePath 與 targetPath（Create/Move 皆可能有）。
 * 回傳前一律 canonicalize，確保語意同檔字串不同時仍互斥。
 * @param changeset 變更集
 * @returns 去重且 canonicalize 後的檔案路徑列表
 */
function collectTouchedPaths(changeset: Changeset): string[] {
  const paths = new Set<string>();

  for (const textChange of changeset.textChanges) {
    paths.add(canonicalizePath(textChange.filePath));
  }

  for (const operation of changeset.fileOperations) {
    paths.add(canonicalizePath(operation.sourcePath));
    if (operation.targetPath) {
      paths.add(canonicalizePath(operation.targetPath));
    }
  }

  return [...paths];
}

/**
 * 變更應用器
 * 統一處理文字變更和檔案操作的應用邏輯
 */
export class ChangeApplicator {
  constructor(private readonly fileSystem: IFileSystem) {}

  /**
   * 應用變更集
   * @param changeset 要應用的變更集
   * @param options 應用選項
   * @returns 應用結果
   */
  async apply(changeset: Changeset, options: ApplyOptions = {}): Promise<ApplyResult> {
    const { dryRun = false, atomic = true, rollbackOnError = true } = options;

    // dry-run 模式：只計算會修改的檔案，不實際寫入
    if (dryRun) {
      return this.dryRunApply(changeset);
    }

    // 併發鎖檢查必須是這個 async function 內第一個同步動作（在任何 await 之前）：
    // 若本次 changeset 觸及的任一檔案已被另一個尚未完成的 apply() 呼叫佔用，
    // 立即 fast-fail 回報衝突，禁止繼續執行導致兩者都回報成功、後寫者靜默覆蓋前者。
    const touchedPaths = collectTouchedPaths(changeset);
    const conflictPath = touchedPaths.find(p => filesInFlight.has(p));
    if (conflictPath) {
      return {
        success: false,
        modifiedFiles: [],
        createdFiles: [],
        deletedFiles: [],
        movedFiles: [],
        errors: [`並發衝突：檔案 [${conflictPath}] 正被另一個進行中的變更套用佔用，本次套用已中止（避免靜默覆蓋對方結果）`]
      };
    }
    for (const p of touchedPaths) {
      filesInFlight.add(p);
    }

    const backups: BackupEntry[] = [];
    const modifiedFiles: string[] = [];
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];
    const movedFiles: Array<{ from: string; to: string }> = [];
    const errors: string[] = [];

    // 外層 try/finally：無論成功／失敗／回滾，本次佔用的檔案鎖都必須釋放，
    // 讓後續 apply() 得以進行（內層 try/catch 為原有套用/回滾邏輯，不變）
    try {
      try {
        // 1. 建立備份
        await this.createBackups(changeset, backups);

        // 2. 應用文字變更
        for (const textChange of changeset.textChanges) {
          try {
            await this.applyTextChange(textChange, atomic);
            modifiedFiles.push(textChange.filePath);
          } catch (error) {
            const message = getErrorMessage(error);
            errors.push(`文字變更失敗 [${textChange.filePath}]: ${message}`);

            if (rollbackOnError) {
              const rollbackErrors = await this.rollback(backups, atomic);
              return {
                success: false,
                modifiedFiles: [],
                createdFiles: [],
                deletedFiles: [],
                movedFiles: [],
                errors: [...errors, ...rollbackErrors]
              };
            }
          }
        }

        // 3. 應用檔案操作
        for (const operation of changeset.fileOperations) {
          try {
            await this.applyFileOperation(operation, atomic);

            switch (operation.type) {
              case FileOperationType.Create:
                if (operation.targetPath) {
                  createdFiles.push(operation.targetPath);
                }
                break;
              case FileOperationType.Delete:
                deletedFiles.push(operation.sourcePath);
                break;
              case FileOperationType.Move:
                if (operation.targetPath) {
                  movedFiles.push({
                    from: operation.sourcePath,
                    to: operation.targetPath
                  });
                }
                break;
            }
          } catch (error) {
            const message = getErrorMessage(error);
            errors.push(`檔案操作失敗 [${operation.type}]: ${message}`);

            if (rollbackOnError) {
              const rollbackErrors = await this.rollback(backups, atomic);
              return {
                success: false,
                modifiedFiles: [],
                createdFiles: [],
                deletedFiles: [],
                movedFiles: [],
                errors: [...errors, ...rollbackErrors]
              };
            }
          }
        }

        return {
          success: errors.length === 0,
          modifiedFiles,
          createdFiles,
          deletedFiles,
          movedFiles,
          errors: errors.length > 0 ? errors : undefined
        };
      } catch (error) {
        const message = getErrorMessage(error);
        errors.push(`應用變更時發生未預期錯誤: ${message}`);

        if (rollbackOnError && backups.length > 0) {
          const rollbackErrors = await this.rollback(backups, atomic);
          errors.push(...rollbackErrors);
        }

        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          movedFiles: [],
          errors
        };
      }
    } finally {
      for (const p of touchedPaths) {
        filesInFlight.delete(p);
      }
    }
  }

  /**
   * Dry-run 模式：計算會修改的檔案，不實際執行
   * @param changeset 變更集
   * @returns 預覽結果
   */
  private dryRunApply(changeset: Changeset): ApplyResult {
    const modifiedFiles = changeset.textChanges.map(tc => tc.filePath);
    const createdFiles: string[] = [];
    const deletedFiles: string[] = [];
    const movedFiles: Array<{ from: string; to: string }> = [];

    for (const operation of changeset.fileOperations) {
      switch (operation.type) {
        case FileOperationType.Create:
          if (operation.targetPath) {
            createdFiles.push(operation.targetPath);
          }
          break;
        case FileOperationType.Delete:
          deletedFiles.push(operation.sourcePath);
          break;
        case FileOperationType.Move:
          if (operation.targetPath) {
            movedFiles.push({
              from: operation.sourcePath,
              to: operation.targetPath
            });
          }
          break;
      }
    }

    return {
      success: true,
      modifiedFiles,
      createdFiles,
      deletedFiles,
      movedFiles
    };
  }

  /**
   * 建立備份
   * @param changeset 變更集
   * @param backups 備份列表（會被修改）
   */
  private async createBackups(
    changeset: Changeset,
    backups: BackupEntry[]
  ): Promise<void> {
    // 備份文字變更的檔案
    for (const textChange of changeset.textChanges) {
      const exists = await this.fileSystem.exists(textChange.filePath);

      if (exists) {
        const content = await this.fileSystem.readFile(textChange.filePath, 'utf-8');
        backups.push({
          filePath: textChange.filePath,
          originalContent: content as string,
          type: BackupType.Text
        });
      }
    }

    // 備份檔案操作
    for (const operation of changeset.fileOperations) {
      switch (operation.type) {
        case FileOperationType.Create: {
          // 新建檔案：若目標已存在則備份原始內容，否則備份為 null（回滾時刪除）
          if (operation.targetPath) {
            const exists = await this.fileSystem.exists(operation.targetPath);

            if (exists) {
              const content = await this.fileSystem.readFile(operation.targetPath, 'utf-8');
              backups.push({
                filePath: operation.targetPath,
                originalContent: content as string,
                type: BackupType.Delete
              });
            } else {
              backups.push({
                filePath: operation.targetPath,
                originalContent: null,
                type: BackupType.Create
              });
            }
          }
          break;
        }

        case FileOperationType.Delete: {
          // 刪除檔案：備份內容
          const exists = await this.fileSystem.exists(operation.sourcePath);
          if (exists) {
            const content = await this.fileSystem.readFile(operation.sourcePath, 'utf-8');
            backups.push({
              filePath: operation.sourcePath,
              originalContent: content as string,
              type: BackupType.Delete
            });
          }
          break;
        }

        case FileOperationType.Move: {
          // 移動檔案或目錄：備份來源內容
          const exists = await this.fileSystem.exists(operation.sourcePath);
          if (exists) {
            // 檢查是目錄還是檔案
            const isDir = await this.fileSystem.isDirectory(operation.sourcePath);
            if (isDir) {
              // 目錄移動：不備份內容（由 moveDirectory 處理）
              backups.push({
                filePath: operation.sourcePath,
                originalContent: null, // 目錄不備份內容
                type: BackupType.Move,
                targetPath: operation.targetPath
              });
            } else {
              const content = await this.fileSystem.readFile(operation.sourcePath, 'utf-8');
              backups.push({
                filePath: operation.sourcePath,
                originalContent: content as string,
                type: BackupType.Move,
                targetPath: operation.targetPath
              });
            }
          }
          break;
        }
      }
    }
  }

  /**
   * 應用單一文字變更
   * @param textChange 文字變更
   * @param atomic 是否使用原子寫入
   */
  private async applyTextChange(
    textChange: FileTextChange,
    atomic: boolean
  ): Promise<void> {
    const content = await this.fileSystem.readFile(textChange.filePath, 'utf-8');
    // 委派給共用的編輯套用核心（dedupe→重疊檢查→排序→套用），實寫終態的單一權威來源
    const newContent = applyTextEdits(content as string, textChange.edits);

    await this.fileSystem.writeFile(textChange.filePath, newContent, {
      fsync: atomic
    });
  }

  /**
   * 應用檔案操作
   * @param operation 檔案操作
   * @param atomic 是否使用原子寫入
   */
  private async applyFileOperation(
    operation: FileOperation,
    atomic: boolean
  ): Promise<void> {
    switch (operation.type) {
      case FileOperationType.Create:
        if (!operation.targetPath) {
          throw new Error('CREATE 操作需要 targetPath');
        }
        await this.fileSystem.writeFile(
          operation.targetPath,
          operation.content ?? '',
          { fsync: atomic }
        );
        break;

      case FileOperationType.Delete:
        await this.fileSystem.deleteFile(operation.sourcePath);
        break;

      case FileOperationType.Move: {
        if (!operation.targetPath) {
          throw new Error('MOVE 操作需要 targetPath');
        }
        // 檢查是目錄還是檔案
        const isDir = await this.fileSystem.isDirectory(operation.sourcePath);
        if (isDir) {
          await this.moveDirectory(operation.sourcePath, operation.targetPath);
        } else {
          await this.fileSystem.moveFile(operation.sourcePath, operation.targetPath);
        }
        break;
      }
    }
  }

  /**
   * 遞迴移動目錄
   * @param source 來源目錄
   * @param target 目標目錄
   */
  private async moveDirectory(source: string, target: string): Promise<void> {
    // 建立目標目錄（recursive: true 確保父目錄也被建立）
    await this.fileSystem.createDirectory(target, true);

    // 讀取源目錄內容
    const entries = await this.fileSystem.readDirectory(source);

    for (const entry of entries) {
      const sourcePath = entry.path;
      // 使用 path 模組計算相對路徑
      const relativePath = sourcePath.slice(source.length);
      const targetPath = target + relativePath;

      if (entry.isDirectory) {
        // 遞迴處理子目錄
        await this.moveDirectory(sourcePath, targetPath);
      } else if (entry.isFile) {
        // 移動檔案
        await this.fileSystem.moveFile(sourcePath, targetPath);
      }
    }

    // 刪除原目錄
    await this.fileSystem.deleteDirectory(source);
  }

  /**
   * 回滾所有變更
   * 反向遍歷備份，恢復原始狀態
   *
   * Bug A 修復：回滾寫入必須沿用與 forward apply 相同的原子寫入原語
   * （write-temp-then-rename，見 file-system.ts 的 atomicWrite）。原本回滾寫入
   * 一律走非原子直接寫入，即使 forward apply 是原子的；若非原子寫入中途被
   * I/O 錯誤（如磁碟已滿）中斷，檔案會被截斷成半殘留的損毀狀態，且不屬於
   * 「新內容」也不屬於「原始內容」任一終態。改用 { fsync: atomic } 後，失敗
   * 只會發生在 commit（rename）前，檔案維持在回滾前的狀態，絕不出現半殘留。
   *
   * @param backups 備份列表
   * @param atomic 是否使用與 forward apply 相同的原子寫入（沿用呼叫端的 atomic 選項）
   * @returns 回滾過程中發生的錯誤列表
   */
  private async rollback(backups: readonly BackupEntry[], atomic: boolean): Promise<readonly string[]> {
    const rollbackErrors: string[] = [];

    // 反向遍歷備份
    for (let i = backups.length - 1; i >= 0; i--) {
      const backup = backups[i];

      try {
        switch (backup.type) {
          case BackupType.Text:
          case BackupType.Delete:
            // 恢復原始內容
            if (backup.originalContent !== null) {
              await this.fileSystem.writeFile(backup.filePath, backup.originalContent, { fsync: atomic });
            }
            break;

          case BackupType.Create: {
            // 刪除新建的檔案
            const exists = await this.fileSystem.exists(backup.filePath);
            if (exists) {
              await this.fileSystem.deleteFile(backup.filePath);
            }
            break;
          }

          case BackupType.Move: {
            // 將檔案/目錄移回原位置
            if (backup.targetPath) {
              const targetExists = await this.fileSystem.exists(backup.targetPath);
              if (targetExists) {
                if (backup.originalContent !== null) {
                  // 檔案移動：刪除目標檔案，恢復原始內容
                  await this.fileSystem.deleteFile(backup.targetPath);
                  await this.fileSystem.writeFile(backup.filePath, backup.originalContent, { fsync: atomic });
                } else {
                  // 目錄移動：把目錄移回原位置
                  await this.moveDirectory(backup.targetPath, backup.filePath);
                }
              }
            }
            break;
          }
        }
      } catch (error) {
        // 回滾時發生錯誤，收集錯誤並繼續處理其他項目
        const message = getErrorMessage(error);
        rollbackErrors.push(`回滾失敗 [${backup.filePath}]: ${message}`);
      }
    }

    return rollbackErrors;
  }
}
