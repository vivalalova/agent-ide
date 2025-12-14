/**
 * Dead Code 刪除器
 * 負責刪除未使用的程式碼並清理相關 import
 */

import type { Range } from '@shared/types/core.js';
import type { SymbolType } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  DeadCodeItem,
  DeadCodeRemovalOptions,
  DeadCodeRemovalPreview,
  DeadCodeRemovalResult,
  RemovalOperation,
  ImportCleanupOperation,
  RemovalSummary,
  UpdatedFile
} from './types.js';
import { DEFAULT_REMOVAL_OPTIONS } from './types.js';

/**
 * Dead Code 刪除器
 */
export class DeadCodeRemover {
  private readonly options: Required<DeadCodeRemovalOptions>;
  private readonly fileCache = new Map<string, string>();

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    options?: DeadCodeRemovalOptions
  ) {
    this.options = { ...DEFAULT_REMOVAL_OPTIONS, ...options };
  }

  /**
   * 預覽刪除操作
   */
  async preview(deadCodeItems: readonly DeadCodeItem[]): Promise<DeadCodeRemovalPreview> {
    try {
      // 1. 過濾符合條件的項目
      const { filteredItems, warnings } = this.filterItems(deadCodeItems);

      if (filteredItems.length === 0) {
        return this.createEmptyPreview(warnings);
      }

      // 2. 產生刪除操作
      const removals = await this.generateRemovalOperations(filteredItems);

      // 3. 分析並產生 import 清理操作
      const importCleanups = this.options.cleanupImports
        ? await this.analyzeImportCleanups(removals)
        : [];

      // 4. 計算統計
      const summary = this.calculateSummary(removals, importCleanups);

      // 5. 收集影響的檔案
      const affectedFiles = this.collectAffectedFiles(removals, importCleanups);

      return {
        success: true,
        removals,
        importCleanups,
        affectedFiles,
        summary,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        success: false,
        removals: [],
        importCleanups: [],
        affectedFiles: [],
        summary: this.createEmptySummary(),
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * 執行刪除（非 dry-run 時）
   */
  async execute(preview: DeadCodeRemovalPreview): Promise<DeadCodeRemovalResult> {
    if (!preview.success) {
      return {
        success: false,
        updatedFiles: [],
        summary: preview.summary,
        errors: preview.errors
      };
    }

    const errors: string[] = [];
    const updatedFiles: UpdatedFile[] = [];

    // 按檔案分組操作
    const fileOperations = this.groupOperationsByFile(preview);

    // 逐檔案套用變更
    for (const [filePath, operations] of fileOperations) {
      try {
        const result = await this.applyFileOperations(filePath, operations);
        updatedFiles.push(result);
      } catch (error) {
        errors.push(`檔案 ${filePath} 處理失敗: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: errors.length === 0,
      updatedFiles,
      summary: preview.summary,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 過濾符合刪除條件的項目
   */
  private filterItems(items: readonly DeadCodeItem[]): {
    filteredItems: DeadCodeItem[];
    warnings: string[];
  } {
    const filteredItems: DeadCodeItem[] = [];
    const warnings: string[] = [];

    for (const item of items) {
      // 信心度檢查
      if (item.confidence < this.options.minConfidence) {
        warnings.push(`跳過 ${item.name}：信心度 ${(item.confidence * 100).toFixed(0)}% 低於門檻 ${(this.options.minConfidence * 100).toFixed(0)}%`);
        continue;
      }

      // 排除檔案模式
      if (this.options.excludeFiles.some(pattern =>
        item.location.filePath.includes(pattern)
      )) {
        warnings.push(`跳過 ${item.name}：檔案被排除`);
        continue;
      }

      // 排除符號名稱
      if (this.options.excludeSymbols.includes(item.name)) {
        warnings.push(`跳過 ${item.name}：符號被排除`);
        continue;
      }

      filteredItems.push(item);
    }

    return { filteredItems, warnings };
  }

  /**
   * 產生刪除操作
   */
  private async generateRemovalOperations(
    items: readonly DeadCodeItem[]
  ): Promise<RemovalOperation[]> {
    const operations: RemovalOperation[] = [];

    for (const item of items) {
      const content = await this.readFile(item.location.filePath);
      if (!content) {
        continue;
      }

      // 擴展範圍以包含完整宣告（含 JSDoc 註解）
      const expandedRange = this.expandRangeToFullDeclaration(
        content,
        item.location.range,
        item.type
      );

      const originalCode = this.extractCode(content, expandedRange);

      operations.push({
        filePath: item.location.filePath,
        range: expandedRange,
        originalCode,
        symbolName: item.name,
        symbolType: item.type,
        confidence: item.confidence
      });
    }

    return operations;
  }

  /**
   * 分析需要清理的 import
   */
  private async analyzeImportCleanups(
    removals: readonly RemovalOperation[]
  ): Promise<ImportCleanupOperation[]> {
    const cleanups: ImportCleanupOperation[] = [];
    const affectedFiles = new Set(removals.map(r => r.filePath));
    const removedSymbols = new Set(removals.map(r => r.symbolName));

    for (const filePath of affectedFiles) {
      const content = await this.readFile(filePath);
      if (!content) {
        continue;
      }

      // 解析 import 語句
      const imports = this.parseImports(content);

      for (const importInfo of imports) {
        // 檢查 import 的符號是否在被刪除的列表中
        // 如果是，這個 import 可能變成未使用
        if (removedSymbols.has(importInfo.symbolName)) {
          // 檢查這個 import 是否還有其他用途
          const stillUsed = this.isImportStillUsed(
            content,
            importInfo.symbolName,
            removals.filter(r => r.filePath === filePath)
          );

          if (!stillUsed) {
            cleanups.push({
              filePath,
              range: importInfo.range,
              originalImport: importInfo.statement,
              unusedSymbol: importInfo.symbolName
            });
          }
        }
      }
    }

    return cleanups;
  }

  /**
   * 解析 import 語句
   * 支援 named import, default import, namespace import, 多行 import
   */
  private parseImports(content: string): Array<{
    symbolName: string;
    statement: string;
    range: Range;
    isDefault?: boolean;
    isNamespace?: boolean;
  }> {
    const imports: Array<{
      symbolName: string;
      statement: string;
      range: Range;
      isDefault?: boolean;
      isNamespace?: boolean;
    }> = [];

    const lines = content.split('\n');

    // 用於處理多行 import
    let multiLineImport = '';
    let multiLineStartLine = -1;
    let multiLineCount = 0;
    const MAX_MULTILINE_IMPORT = 20; // 安全限制：最多 20 行

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 處理多行 import
      if (multiLineImport) {
        multiLineImport += '\n' + line;
        multiLineCount++;

        // 檢測結束條件：有 from 或 semicolon，或超過安全限制
        const isComplete = line.includes('from') || line.includes(';');
        const isOverLimit = multiLineCount > MAX_MULTILINE_IMPORT;

        if (isComplete || isOverLimit) {
          // 多行 import 結束
          this.parseImportLine(multiLineImport, multiLineStartLine, lineNumber, imports);
          multiLineImport = '';
          multiLineStartLine = -1;
          multiLineCount = 0;
        }
        continue;
      }

      // 檢查是否為多行 import 開始（有 { 但沒有 } 或沒有 from）
      if (line.match(/^\s*import\s*\{/) && !line.includes('}')) {
        multiLineImport = line;
        multiLineStartLine = lineNumber;
        multiLineCount = 1;
        continue;
      }

      // 單行處理
      this.parseImportLine(line, lineNumber, lineNumber, imports);
    }

    return imports;
  }

  /**
   * 解析單行或合併後的 import 語句
   */
  private parseImportLine(
    line: string,
    startLine: number,
    endLine: number,
    imports: Array<{
      symbolName: string;
      statement: string;
      range: Range;
      isDefault?: boolean;
      isNamespace?: boolean;
    }>
  ): void {
    const trimmedLine = line.replace(/\s+/g, ' ').trim();

    // 1. Namespace import: import * as X from '...'
    const namespaceMatch = trimmedLine.match(/import\s+\*\s+as\s+(\w+)\s+from/);
    if (namespaceMatch) {
      imports.push({
        symbolName: namespaceMatch[1],
        statement: trimmedLine,
        range: {
          start: { line: startLine, column: 1, offset: undefined },
          end: { line: endLine, column: line.length + 1, offset: undefined }
        },
        isNamespace: true
      });
      return;
    }

    // 2. Default import with named: import X, { Y } from '...'
    const defaultWithNamedMatch = trimmedLine.match(/import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from/);
    if (defaultWithNamedMatch) {
      // Default import
      imports.push({
        symbolName: defaultWithNamedMatch[1],
        statement: trimmedLine,
        range: {
          start: { line: startLine, column: 1, offset: undefined },
          end: { line: endLine, column: line.length + 1, offset: undefined }
        },
        isDefault: true
      });
      // Named imports
      const symbols = defaultWithNamedMatch[2].split(',').map(s => s.trim());
      for (const symbol of symbols) {
        const cleanSymbol = symbol.split(/\s+as\s+/)[0].trim();
        if (cleanSymbol && !cleanSymbol.startsWith('type ')) {
          imports.push({
            symbolName: cleanSymbol,
            statement: trimmedLine,
            range: {
              start: { line: startLine, column: 1, offset: undefined },
              end: { line: endLine, column: line.length + 1, offset: undefined }
            }
          });
        }
      }
      return;
    }

    // 3. Default import only: import X from '...'
    const defaultMatch = trimmedLine.match(/import\s+(\w+)\s+from\s+['"]/);
    if (defaultMatch && !trimmedLine.includes('{')) {
      imports.push({
        symbolName: defaultMatch[1],
        statement: trimmedLine,
        range: {
          start: { line: startLine, column: 1, offset: undefined },
          end: { line: endLine, column: line.length + 1, offset: undefined }
        },
        isDefault: true
      });
      return;
    }

    // 4. Named import: import { X, Y } from '...'
    const namedImportMatch = trimmedLine.match(/import\s*(?:type\s*)?\{([^}]+)\}\s*from/);
    if (namedImportMatch) {
      const symbols = namedImportMatch[1].split(',').map(s => s.trim());
      for (const symbol of symbols) {
        // 處理 as 別名，跳過 type-only imports
        const cleanSymbol = symbol.split(/\s+as\s+/)[0].trim();
        if (cleanSymbol && !cleanSymbol.startsWith('type ')) {
          imports.push({
            symbolName: cleanSymbol,
            statement: trimmedLine,
            range: {
              start: { line: startLine, column: 1, offset: undefined },
              end: { line: endLine, column: line.length + 1, offset: undefined }
            }
          });
        }
      }
    }
  }

  /**
   * 檢查 import 是否仍被使用
   * 排除註解和字串中的匹配
   */
  private isImportStillUsed(
    content: string,
    symbolName: string,
    removalsInFile: readonly RemovalOperation[]
  ): boolean {
    // 移除註解和字串後再檢查
    const cleanContent = this.removeCommentsAndStrings(content);

    // 建立正則表達式匹配符號使用
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');

    // 計算清理後內容中的使用次數
    const matches = cleanContent.match(regex) || [];
    const originalCount = matches.length;

    // 計算被刪除的程式碼中的使用次數（也清理註解和字串）
    let removedCount = 0;
    for (const removal of removalsInFile) {
      const cleanRemoval = this.removeCommentsAndStrings(removal.originalCode);
      const removedMatches = cleanRemoval.match(regex) || [];
      removedCount += removedMatches.length;
    }

    // 如果刪除後還有使用，則 import 仍需要
    // -1 是因為 import 語句本身也會匹配
    return (originalCount - removedCount) > 1;
  }

  /**
   * 移除註解和字串，用於準確檢測符號使用
   */
  private removeCommentsAndStrings(content: string): string {
    let result = content;

    // 移除多行註解 /* ... */
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');

    // 移除單行註解 // ...
    result = result.replace(/\/\/[^\n]*/g, '');

    // 移除模板字串 `...`（簡化處理，不處理嵌套）
    result = result.replace(/`(?:[^`\\]|\\.)*`/g, '""');

    // 移除雙引號字串 "..."
    result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');

    // 移除單引號字串 '...'
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");

    return result;
  }

  /**
   * 擴展範圍至完整宣告（包含前導註解和空行）
   * 使用清理後的內容進行括號匹配，避免字串/註解中的括號干擾
   */
  private expandRangeToFullDeclaration(
    content: string,
    range: Range,
    symbolType: SymbolType
  ): Range {
    const lines = content.split('\n');
    let startLine = range.start.line - 1; // 轉為 0-based

    // 向上擴展：包含 JSDoc 註解和裝飾器
    while (startLine > 0) {
      const prevLine = lines[startLine - 1].trim();
      if (
        prevLine.endsWith('*/') ||
        prevLine.startsWith('*') ||
        prevLine.startsWith('//') ||
        prevLine.startsWith('@') ||
        prevLine === ''
      ) {
        startLine--;
      } else {
        break;
      }
    }

    // 向下擴展：確保包含完整的結尾
    let endLine = range.end.line - 1;

    // 對於 class/function，需要找到對應的結尾括號
    if (symbolType === 'class' || symbolType === 'function') {
      let braceCount = 0;
      let foundOpenBrace = false;

      for (let i = range.start.line - 1; i < lines.length; i++) {
        // 清理該行的註解和字串，避免括號誤判
        const cleanLine = this.removeCommentsAndStringsFromLine(lines[i]);
        for (const char of cleanLine) {
          if (char === '{') {
            braceCount++;
            foundOpenBrace = true;
          }
          if (char === '}') {
            braceCount--;
          }
        }

        if (foundOpenBrace && braceCount === 0) {
          endLine = i;
          break;
        }
      }
    }

    // 包含後續空行（最多一行）
    if (endLine < lines.length - 1 && lines[endLine + 1].trim() === '') {
      endLine++;
    }

    return {
      start: { line: startLine + 1, column: 1, offset: undefined },
      end: { line: endLine + 1, column: lines[endLine].length + 1, offset: undefined }
    };
  }

  /**
   * 移除單行中的註解和字串（用於括號匹配）
   */
  private removeCommentsAndStringsFromLine(line: string): string {
    let result = line;

    // 移除單行註解 // ...
    const commentIndex = result.indexOf('//');
    if (commentIndex !== -1) {
      // 確保 // 不在字串中
      const beforeComment = result.substring(0, commentIndex);
      const quoteCount = (beforeComment.match(/['"]/g) || []).length;
      if (quoteCount % 2 === 0) {
        result = beforeComment;
      }
    }

    // 移除字串（簡化處理）
    result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
    result = result.replace(/`(?:[^`\\]|\\.)*`/g, '""');

    return result;
  }

  /**
   * 提取程式碼
   */
  private extractCode(content: string, range: Range): string {
    const lines = content.split('\n');
    // 邊界檢查：確保索引在有效範圍內
    const startLine = Math.max(0, Math.min(range.start.line - 1, lines.length - 1));
    const endLine = Math.max(0, Math.min(range.end.line - 1, lines.length - 1));

    if (startLine === endLine) {
      const line = lines[startLine] || '';
      return line.substring(range.start.column - 1, range.end.column - 1);
    }

    const result: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i] || '';
      if (i === startLine) {
        result.push(line.substring(range.start.column - 1));
      } else if (i === endLine) {
        result.push(line.substring(0, range.end.column - 1));
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 按檔案分組操作
   */
  private groupOperationsByFile(
    preview: DeadCodeRemovalPreview
  ): Map<string, Array<{ range: Range; type: 'removal' | 'import' }>> {
    const fileOperations = new Map<string, Array<{ range: Range; type: 'removal' | 'import' }>>();

    // 加入刪除操作
    for (const removal of preview.removals) {
      const existing = fileOperations.get(removal.filePath) || [];
      existing.push({ range: removal.range, type: 'removal' });
      fileOperations.set(removal.filePath, existing);
    }

    // 加入 import 清理操作
    for (const cleanup of preview.importCleanups) {
      const existing = fileOperations.get(cleanup.filePath) || [];
      existing.push({ range: cleanup.range, type: 'import' });
      fileOperations.set(cleanup.filePath, existing);
    }

    return fileOperations;
  }

  /**
   * 套用檔案操作
   */
  private async applyFileOperations(
    filePath: string,
    operations: Array<{ range: Range; type: 'removal' | 'import' }>
  ): Promise<UpdatedFile> {
    const originalContent = await this.readFile(filePath);
    if (!originalContent) {
      throw new Error(`無法讀取檔案: ${filePath}`);
    }

    // 按位置從後往前排序（避免位置偏移）
    const sortedOps = [...operations].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.column - a.range.start.column;
    });

    let lines = originalContent.split('\n');
    let removedSymbols = 0;
    let cleanedImports = 0;

    for (const op of sortedOps) {
      // 邊界檢查：確保索引在有效範圍內
      const startLine = Math.max(0, Math.min(op.range.start.line - 1, lines.length - 1));
      const endLine = Math.max(startLine, Math.min(op.range.end.line - 1, lines.length - 1));
      const deleteCount = endLine - startLine + 1;

      // 確保不會刪除超出範圍的行
      if (startLine < lines.length && deleteCount > 0) {
        lines.splice(startLine, deleteCount);
      }

      if (op.type === 'removal') {
        removedSymbols++;
      } else {
        cleanedImports++;
      }
    }

    // 清理連續空行（最多保留一行）
    lines = this.cleanupEmptyLines(lines);

    const newContent = lines.join('\n');

    // 寫入檔案
    await this.writeFile(filePath, newContent);

    return {
      filePath,
      removedSymbols,
      cleanedImports
    };
  }

  /**
   * 清理連續空行
   */
  private cleanupEmptyLines(lines: string[]): string[] {
    const result: string[] = [];
    let prevEmpty = false;

    for (const line of lines) {
      const isEmpty = line.trim() === '';

      if (isEmpty && prevEmpty) {
        // 跳過連續的空行
        continue;
      }

      result.push(line);
      prevEmpty = isEmpty;
    }

    return result;
  }

  /**
   * 計算統計摘要
   */
  private calculateSummary(
    removals: readonly RemovalOperation[],
    importCleanups: readonly ImportCleanupOperation[]
  ): RemovalSummary {
    const byType: Record<string, number> = {};

    for (const removal of removals) {
      byType[removal.symbolType] = (byType[removal.symbolType] || 0) + 1;
    }

    const filesAffected = new Set([
      ...removals.map(r => r.filePath),
      ...importCleanups.map(c => c.filePath)
    ]).size;

    // 計算刪除的行數
    let linesRemoved = 0;
    for (const removal of removals) {
      linesRemoved += removal.range.end.line - removal.range.start.line + 1;
    }
    for (const cleanup of importCleanups) {
      linesRemoved += cleanup.range.end.line - cleanup.range.start.line + 1;
    }

    return {
      totalRemovals: removals.length,
      byType,
      filesAffected,
      linesRemoved,
      importsCleanedUp: importCleanups.length
    };
  }

  /**
   * 收集影響的檔案
   */
  private collectAffectedFiles(
    removals: readonly RemovalOperation[],
    importCleanups: readonly ImportCleanupOperation[]
  ): string[] {
    const files = new Set<string>();

    for (const removal of removals) {
      files.add(removal.filePath);
    }
    for (const cleanup of importCleanups) {
      files.add(cleanup.filePath);
    }

    return Array.from(files);
  }

  /**
   * 建立空的預覽結果
   */
  private createEmptyPreview(warnings: string[]): DeadCodeRemovalPreview {
    return {
      success: true,
      removals: [],
      importCleanups: [],
      affectedFiles: [],
      summary: this.createEmptySummary(),
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * 建立空的統計摘要
   */
  private createEmptySummary(): RemovalSummary {
    return {
      totalRemovals: 0,
      byType: {},
      filesAffected: 0,
      linesRemoved: 0,
      importsCleanedUp: 0
    };
  }

  /**
   * 讀取檔案
   */
  private async readFile(filePath: string): Promise<string | null> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      this.fileCache.set(filePath, contentStr);
      return contentStr;
    } catch {
      return null;
    }
  }

  /**
   * 寫入檔案
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    await this.fileSystem.writeFile(filePath, content);
    this.fileCache.set(filePath, content);
  }

  /**
   * 逸出正則表達式特殊字符
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}

/**
 * 建立 DeadCodeRemover 實例
 */
export function createDeadCodeRemover(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem,
  options?: DeadCodeRemovalOptions
): DeadCodeRemover {
  return new DeadCodeRemover(parserRegistry, fileSystem, options);
}
