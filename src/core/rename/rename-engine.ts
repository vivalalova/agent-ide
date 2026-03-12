/**
 * 重新命名引擎實作
 * 負責執行符號重新命名操作
 */

import {
  RenameOptions,
  RenameOperation,
  RenamePreview,
  ValidationResult,
  ConflictInfo,
  ConflictType,
  RenameSummary,
  ScopeAnalysisResult,
  createConflictInfo
} from './types.js';
import { createRange, createPosition } from '@shared/types/core.js';
import { Symbol } from '@shared/types/symbol.js';
import { ScopeAnalyzer } from './scope-analyzer.js';
import { ReferenceUpdater } from './reference-updater.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { FileSystem } from '@infrastructure/storage/index.js';
import { ChangesetCommand, TextEditOperationType, type Changeset } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder } from '@infrastructure/changeset/index.js';

/** 預編譯的 Unicode 識別符正則表達式 */
const UNICODE_IDENTIFIER_PATTERN = /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u;

/**
 * 重新命名引擎類別
 * 使用 Parser 的 AST 分析進行精確的符號重命名
 */
export class RenameEngine {
  private readonly reservedKeywords = new Set([
    'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while',
    'do', 'switch', 'case', 'break', 'continue', 'return', 'try',
    'catch', 'finally', 'throw', 'class', 'interface', 'enum',
    'import', 'export', 'default', 'from', 'as', 'type'
  ]);

  private readonly scopeAnalyzer: ScopeAnalyzer;
  private readonly referenceUpdater: ReferenceUpdater;
  private readonly fileSystem: IFileSystem;

  constructor(parserRegistry?: ParserRegistry, fileSystem?: IFileSystem) {
    // eslint-disable-next-line custom/no-new-filesystem, custom/no-default-instance-in-constructor -- 需要向後相容
    this.fileSystem = fileSystem ?? new FileSystem();
    this.scopeAnalyzer = new ScopeAnalyzer();
    this.referenceUpdater = new ReferenceUpdater(parserRegistry, this.fileSystem);
  }

  /**
   * 查找符號的所有引用
   */
  async findReferences(
    filePaths: string[],
    symbol: Symbol,
    _position?: { line: number; column: number }
  ): Promise<Array<{ filePath: string; line: number; column: number; text: string }>> {
    const references: Array<{ filePath: string; line: number; column: number; text: string }> = [];

    // 使用簡單的文字匹配來查找引用
    try {
      for (const filePath of filePaths) {
        try {
          // 使用注入的 fileSystem 讀取檔案內容
          const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
          const lines = content.split('\n');

          // 使用單詞邊界進行精確匹配（快取 RegExp 避免重複編譯）
          const regex = new RegExp(`\\b${symbol.name}\\b`, 'g');

          // 查找所有包含符號名稱的行
          lines.forEach((line, lineIndex) => {
            // 重置 lastIndex 以便在每行重新匹配
            regex.lastIndex = 0;
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
          console.warn('[rename-engine] Cannot read file during reference search:', error);
        }
      }
    } catch (error) {
      console.warn('[rename-engine] Unexpected error during reference search:', error);
    }

    return references;
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

    if (!validation.isValid) {
      return {
        operations: [],
        affectedFiles: [],
        conflicts: validation.conflicts,
        summary: {
          totalReferences: 0,
          totalFiles: 0,
          conflictCount: validation.conflicts.length,
          estimatedTime: 0
        }
      };
    }

    // 確保 symbol 有 location
    const hasLocation = options.symbol.location && options.symbol.location.filePath;
    if (!hasLocation) {
      return {
        operations: [],
        affectedFiles: [],
        conflicts: validation.conflicts,
        summary: {
          totalReferences: 0,
          totalFiles: 0,
          conflictCount: validation.conflicts.length,
          estimatedTime: 0
        }
      };
    }

    try {
      // 使用共用的收集邏輯（與實際執行相同）
      const fileChanges = await this.referenceUpdater.collectRenameChanges(
        options.symbol,
        options.newName,
        Array.from(options.filePaths)
      );

      // 轉換為 RenameOperation（包含 context 資訊）
      const operations: RenameOperation[] = [];
      const affectedFiles: string[] = [];

      for (const { filePath, changes } of fileChanges) {
        affectedFiles.push(filePath);
        for (const change of changes) {
          // 使用物件字面值來包含 context（createRenameOperation 不支援 context 參數）
          const operation: RenameOperation = {
            filePath,
            oldText: change.oldText,
            newText: change.newText,
            range: change.range,
            context: change.context
          };
          operations.push(operation);
        }
      }

      const summary: RenameSummary = {
        totalReferences: operations.length,
        totalFiles: affectedFiles.length,
        conflictCount: validation.conflicts.length,
        estimatedTime: operations.length * 10 // 預估每個操作 10ms
      };

      return {
        operations,
        affectedFiles,
        conflicts: validation.conflicts,
        summary
      };
    } catch (error) {
      console.warn('[rename-engine] Preview generation failed:', error);
      throw error;
    }
  }

  /**
   * 生成重命名的 Changeset
   * 不執行實際寫入，只計算變更
   *
   * 即使驗證失敗（如保留字衝突），仍會返回 success: true 並附帶 warnings，
   * 讓命令層可以顯示衝突資訊和預覽結果。
   *
   * @param options 重命名選項
   * @returns Changeset 物件（包含所有變更資訊）
   */
  async generateChangeset(options: RenameOptions): Promise<Changeset> {
    // 1. 驗證（收集衝突但不阻止繼續處理）
    const validation = await this.validateRename(options);

    // 2. 使用 collectRenameChanges 收集變更
    const fileChanges = await this.referenceUpdater.collectRenameChanges(
      options.symbol,
      options.newName,
      Array.from(options.filePaths)
    );

    // 3. 轉換為 Changeset
    const builder = createChangesetBuilder()
      .forCommand(ChangesetCommand.Rename)
      .withDescription(`Renamed '${options.symbol.name}' to '${options.newName}'`);

    for (const { filePath, changes } of fileChanges) {
      const edits = changes.map(change => ({
        range: change.range,
        newText: change.newText,
        description: `Rename ${change.oldText} → ${change.newText}`
      }));
      builder.addTextChange(filePath, edits, TextEditOperationType.Rename);
    }

    // 4. 加入驗證衝突為警告（格式：type:message，方便解析）
    for (const conflict of validation.conflicts) {
      builder.addWarning(`${conflict.type}:${conflict.message}`);
    }

    return builder.build();
  }

  /**
   * 檢測命名衝突
   * @param newName 新名稱
   * @param scope 作用域資訊（用於檢測作用域衝突）
   * @param originalSymbolName 原始符號名稱（可選，用於排除自身）
   */
  detectConflicts(
    newName: string,
    scope?: ScopeAnalysisResult,
    originalSymbolName?: string
  ): ConflictInfo[] {
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

    // 使用 ScopeAnalyzer 檢查作用域衝突
    if (scope) {
      // 檢查當前作用域中是否有同名符號（排除原始符號自身）
      const conflictingSymbol = scope.symbols.find(
        s => s.name === newName && s.name !== originalSymbolName
      );

      if (conflictingSymbol) {
        conflicts.push(createConflictInfo(
          ConflictType.NameCollision,
          `'${newName}' 在當前作用域中已存在`,
          conflictingSymbol.location
        ));
      }

      // 檢查父作用域是否有同名符號（會導致遮蔽）
      let parentScope = scope.parent;
      while (parentScope) {
        const shadowedSymbol = parentScope.symbols.find(
          s => s.name === newName && s.name !== originalSymbolName
        );

        if (shadowedSymbol) {
          conflicts.push(createConflictInfo(
            ConflictType.ScopeConflict,
            `'${newName}' 會遮蔽外層作用域中的同名變數`,
            shadowedSymbol.location
          ));
          break; // 只報告最近的遮蔽
        }
        parentScope = parentScope.parent;
      }
    }

    return conflicts;
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
   *
   * 支援 Unicode 識別符（Python 3、JavaScript、Swift 等現代語言都支援）：
   * - 第一個字元：字母（任何語言）、底線、或 Unicode 類別 Lu/Ll/Lt/Lm/Lo/Nl
   * - 後續字元：上述 + 數字 + Unicode 類別 Mn/Mc/Nd/Pc
   *
   * 範例：
   * - 用戶名稱 = "John"     # Python 3 合法
   * - const 使用者 = {}     # JavaScript 合法
   * - let 数量: Int = 10    # Swift 合法
   */
  private isValidIdentifier(name: string): boolean {
    if (!name || name.length === 0) {
      return false;
    }

    // 使用預編譯的 Unicode 識別符正則表達式
    // \p{ID_Start} - Unicode 識別符起始字元（包含所有語言的字母）
    // \p{ID_Continue} - Unicode 識別符後續字元（包含字母、數字、連接符等）
    // 注意：也允許 $ 作為起始字元（JavaScript 慣例）
    return UNICODE_IDENTIFIER_PATTERN.test(name);
  }

}