/**
 * 重新命名引擎實作
 * 負責執行符號重新命名操作
 */

import {
  RenameOptions,
  RenameResult,
  RenameOperation,
  RenamePreview,
  ValidationResult,
  BatchRenameResult,
  ConflictInfo,
  ConflictType,
  RenameSummary,
  createRenameOperation,
  createConflictInfo
} from './types';
import { createRange, createPosition } from '../../shared/types/core';
import { Symbol } from '../../shared/types/symbol';
import { ScopeAnalyzer } from './scope-analyzer';
import { ReferenceUpdater } from './reference-updater';

/**
 * 重新命名引擎類別
 */
export class RenameEngine {
  private readonly renameHistory = new Map<string, RenameResult>();
  private readonly reservedKeywords = new Set([
    'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 
    'do', 'switch', 'case', 'break', 'continue', 'return', 'try', 
    'catch', 'finally', 'throw', 'class', 'interface', 'enum',
    'import', 'export', 'default', 'from', 'as', 'type'
  ]);

  private readonly scopeAnalyzer: ScopeAnalyzer;
  private readonly referenceUpdater: ReferenceUpdater;

  constructor() {
    this.scopeAnalyzer = new ScopeAnalyzer();
    this.referenceUpdater = new ReferenceUpdater();
  }

  /**
   * 查找符號的所有引用
   */
  async findReferences(
    filePaths: string[],
    symbol: Symbol,
    position?: { line: number; column: number }
  ): Promise<Array<{ filePath: string; line: number; column: number; text: string }>> {
    const references: Array<{ filePath: string; line: number; column: number; text: string }> = [];

    // 使用簡單的文字匹配來查找引用
    try {
      for (const filePath of filePaths) {
        try {
          // 使用 fs 模組讀取檔案內容
          const fs = await import('fs/promises');
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          // 查找所有包含符號名稱的行
          lines.forEach((line, lineIndex) => {
            // 使用單詞邊界進行精確匹配
            const regex = new RegExp(`\\b${symbol.name}\\b`, 'g');
            let match;

            while ((match = regex.exec(line)) !== null) {
              references.push({
                filePath,
                line: lineIndex + 1,
                column: match.index + 1,
                text: line.trim()
              });
            }
          });
        } catch (error) {
          // 忽略無法讀取的檔案
          console.debug(`無法讀取檔案 ${filePath}:`, error);
        }
      }
    } catch (error) {
      // 備援錯誤處理
      console.error('查找引用時發生錯誤:', error);
    }

    return references;
  }

  /**
   * 執行重新命名操作
   */
  async rename(options: RenameOptions): Promise<RenameResult> {
    // 驗證選項
    this.validateOptions(options);

    // 先驗證重新命名的有效性
    const validation = await this.validateRename(options);
    if (!validation.isValid) {
      return {
        success: false,
        operations: [],
        affectedFiles: [],
        renameId: '',
        errors: validation.errors || ['重新命名驗證失敗']
      };
    }

    try {
      // 使用 ReferenceUpdater 來處理實際的重新命名
      const updateResult = await this.referenceUpdater.updateReferences(
        options.symbol,
        options.newName,
        Array.from(options.filePaths)
      );

      if (!updateResult.success) {
        return {
          success: false,
          operations: [],
          affectedFiles: [],
          renameId: '',
          errors: updateResult.errors || ['重新命名更新失敗']
        };
      }

      // 轉換 UpdatedFile 到 RenameOperation
      const operations: RenameOperation[] = [];
      const affectedFiles: string[] = [];

      for (const updatedFile of updateResult.updatedFiles) {
        affectedFiles.push(updatedFile.filePath);
        for (const change of updatedFile.changes) {
          operations.push(createRenameOperation(
            updatedFile.filePath,
            change.oldText,
            change.newText,
            change.range
          ));
        }
      }

      const renameId = this.generateRenameId();
      const result: RenameResult = {
        success: true,
        operations,
        affectedFiles,
        renameId
      };

      // 儲存到歷史記錄
      this.renameHistory.set(renameId, result);

      return result;
    } catch (error) {
      return {
        success: false,
        operations: [],
        affectedFiles: [],
        renameId: '',
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * 驗證重新命名操作的有效性
   */
  async validateRename(options: RenameOptions): Promise<ValidationResult> {
    this.validateOptions(options);

    const conflicts: ConflictInfo[] = [];

    // 檢查是否為保留字
    if (this.reservedKeywords.has(options.newName)) {
      conflicts.push(createConflictInfo(
        ConflictType.ReservedKeyword,
        `'${options.newName}' 是保留字，不能用作識別符`,
        options.symbol.location
      ));
    }

    // 檢查是否為有效識別符
    if (!this.isValidIdentifier(options.newName)) {
      conflicts.push(createConflictInfo(
        ConflictType.InvalidIdentifier,
        `'${options.newName}' 不是有效的識別符`,
        options.symbol.location
      ));
    }

    return {
      isValid: conflicts.length === 0,
      conflicts,
      warnings: [],
      errors: conflicts.length > 0 ? conflicts.map(c => c.message) : undefined
    };
  }

  /**
   * 預覽重新命名操作
   */
  async previewRename(options: RenameOptions): Promise<RenamePreview> {
    this.validateOptions(options);

    const validation = await this.validateRename(options);

    // 確保 symbol 有 location
    const hasLocation = options.symbol.location && options.symbol.location.filePath;

    const operations = validation.isValid && hasLocation ? [
      createRenameOperation(
        options.symbol.location!.filePath,
        options.symbol.name,
        options.newName,
        options.symbol.location!.range
      )
    ] : [];

    const summary: RenameSummary = {
      totalReferences: operations.length,
      totalFiles: operations.length > 0 ? 1 : 0,
      conflictCount: validation.conflicts.length,
      estimatedTime: operations.length * 10 // 預估每個操作 10ms
    };

    return {
      operations,
      affectedFiles: operations.length > 0 && hasLocation ? [options.symbol.location!.filePath] : [],
      conflicts: validation.conflicts,
      summary
    };
  }

  /**
   * 批次重新命名操作
   */
  async batchRename(operations: RenameOperation[]): Promise<BatchRenameResult> {
    const results: RenameResult[] = [];
    const errors: string[] = [];
    let totalOps = 0;
    
    try {
      // 使用 ReferenceUpdater 批次處理操作
      const updateResult = await this.referenceUpdater.applyRenameOperations(operations);
      
      if (!updateResult.success) {
        return {
          success: false,
          results: [],
          totalOperations: operations.length,
          errors: updateResult.errors || ['批次重新命名失敗']
        };
      }

      // 為每個更新的檔案建立 RenameResult
      const fileOperationsMap = new Map<string, RenameOperation[]>();
      
      // 按檔案分組操作
      for (const operation of operations) {
        const fileOps = fileOperationsMap.get(operation.filePath) || [];
        fileOps.push(operation);
        fileOperationsMap.set(operation.filePath, fileOps);
      }

      // 為每組操作建立結果
      for (const [filePath, fileOps] of Array.from(fileOperationsMap.entries())) {
        const renameId = this.generateRenameId();
        const result: RenameResult = {
          success: true,
          operations: fileOps,
          affectedFiles: [filePath],
          renameId
        };
        
        results.push(result);
        this.renameHistory.set(renameId, result);
        totalOps += fileOps.length;
      }

      return {
        success: true,
        results,
        totalOperations: totalOps
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        results: [],
        totalOperations: operations.length,
        errors
      };
    }
  }

  /**
   * 撤銷重新命名操作
   */
  async undo(renameId: string): Promise<void> {
    if (!this.renameHistory.has(renameId)) {
      throw new Error(`找不到重新命名操作 ID: ${renameId}`);
    }

    const originalResult = this.renameHistory.get(renameId)!;
    
    try {
      // 建立反向操作來撤銷變更
      const undoOperations: RenameOperation[] = originalResult.operations.map(op => 
        createRenameOperation(
          op.filePath,
          op.newText, // 交換新舊文字
          op.oldText,
          op.range
        )
      );

      // 執行撤銷操作
      const undoResult = await this.referenceUpdater.applyRenameOperations(undoOperations);
      
      if (!undoResult.success) {
        throw new Error(`撤銷操作失敗: ${undoResult.errors?.join(', ') || '未知錯誤'}`);
      }

      // 從歷史記錄中移除
      this.renameHistory.delete(renameId);
    } catch (error) {
      throw new Error(`撤銷重新命名操作失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 檢測命名衝突
   */
  detectConflicts(newName: string, scope: any): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];

    // 檢查保留字
    if (this.reservedKeywords.has(newName)) {
      conflicts.push(createConflictInfo(
        ConflictType.ReservedKeyword,
        `'${newName}' 是保留字`,
        { filePath: '', range: createRange(createPosition(1, 1), createPosition(1, 1)) }
      ));
    }

    // 檢查是否為有效識別符
    if (!this.isValidIdentifier(newName)) {
      conflicts.push(createConflictInfo(
        ConflictType.InvalidIdentifier,
        `'${newName}' 不是有效的識別符`,
        { filePath: '', range: createRange(createPosition(1, 1), createPosition(1, 1)) }
      ));
    }

    // TODO: 使用 ScopeAnalyzer 檢查作用域衝突
    // 這需要 AST 和更多上下文資訊，目前先簡化實作

    return conflicts;
  }

  /**
   * 執行跨檔案重新命名
   */
  async renameAcrossFiles(
    symbol: Symbol,
    newName: string,
    projectFiles: string[]
  ): Promise<RenameResult> {
    try {
      // 先驗證重新命名的有效性
      const options = { symbol, newName, filePaths: projectFiles };
      const validation = await this.validateRename(options);
      
      if (!validation.isValid) {
        return {
          success: false,
          operations: [],
          affectedFiles: [],
          renameId: '',
          errors: validation.errors || ['跨檔案重新命名驗證失敗']
        };
      }

      // 使用 ReferenceUpdater 處理跨檔案更新
      const updateResult = await this.referenceUpdater.updateCrossFileReferences(
        symbol,
        newName,
        projectFiles
      );

      if (!updateResult.success) {
        return {
          success: false,
          operations: [],
          affectedFiles: [],
          renameId: '',
          errors: updateResult.errors || ['跨檔案重新命名更新失敗']
        };
      }

      // 轉換結果
      const operations: RenameOperation[] = [];
      const affectedFiles: string[] = [];

      for (const updatedFile of updateResult.updatedFiles) {
        affectedFiles.push(updatedFile.filePath);
        for (const change of updatedFile.changes) {
          operations.push(createRenameOperation(
            updatedFile.filePath,
            change.oldText,
            change.newText,
            change.range
          ));
        }
      }

      const renameId = this.generateRenameId();
      const result: RenameResult = {
        success: true,
        operations,
        affectedFiles,
        renameId
      };

      // 儲存到歷史記錄
      this.renameHistory.set(renameId, result);

      return result;
    } catch (error) {
      return {
        success: false,
        operations: [],
        affectedFiles: [],
        renameId: '',
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * 驗證選項
   */
  private validateOptions(options: RenameOptions): void {
    if (!options.newName || !options.newName.trim()) {
      throw new Error('新名稱不能為空');
    }

    if (!options.filePaths || options.filePaths.length === 0) {
      throw new Error('必須指定至少一個檔案路徑');
    }
  }

  /**
   * 檢查是否為有效識別符
   */
  private isValidIdentifier(name: string): boolean {
    // 簡化的識別符檢查：只允許字母、數字和底線，且不以數字開頭
    const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return identifierRegex.test(name);
  }

  /**
   * 產生重新命名 ID
   */
  private generateRenameId(): string {
    return `rename_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}