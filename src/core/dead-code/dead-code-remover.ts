/**
 * Dead Code 刪除器
 * 負責刪除未使用的程式碼並清理相關 import
 */

import { minimatch } from 'minimatch';
import type { Range } from '@shared/types/core.js';
import type { SymbolType } from '@shared/types/symbol.js';
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
 * Import 語句中的符號資訊
 */
interface ImportSymbolInfo {
  /** 符號名稱 */
  name: string;
  /** 別名（如果有 as） */
  alias?: string;
  /** 是否為 default import */
  isDefault?: boolean;
  /** 是否為 namespace import */
  isNamespace?: boolean;
}

/**
 * Import 語句資訊
 */
interface ImportStatementInfo {
  /** 完整的 import 語句 */
  statement: string;
  /** 語句範圍 */
  range: Range;
  /** 包含的所有符號 */
  symbols: ImportSymbolInfo[];
  /** 是否有 default import */
  hasDefault: boolean;
  /** 是否為 namespace import */
  isNamespace: boolean;
}

/**
 * 檔案操作資訊
 */
interface FileOperation {
  /** 操作範圍 */
  range: Range;
  /** 操作類型 */
  type: 'removal' | 'import-delete' | 'import-partial';
  /** 部分清理時的新內容 */
  newContent?: string;
}

/**
 * Dead Code 刪除器
 */
export class DeadCodeRemover {
  private readonly options: Required<DeadCodeRemovalOptions>;
  private readonly fileCache = new Map<string, string>();

  constructor(
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
      const { operations: removals, warnings: removalWarnings } = await this.generateRemovalOperations(filteredItems);
      warnings.push(...removalWarnings);

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

      // 排除檔案模式（支援 glob 匹配）
      if (this.options.excludeFiles.some(pattern =>
        this.matchesExcludePattern(item.location.filePath, pattern)
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
  ): Promise<{ operations: RemovalOperation[]; warnings: string[] }> {
    const operations: RemovalOperation[] = [];
    const warnings: string[] = [];

    for (const item of items) {
      const content = await this.readFile(item.location.filePath);
      if (!content) {
        warnings.push(`跳過 ${item.name}：無法讀取檔案 ${item.location.filePath}`);
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

    return { operations, warnings };
  }

  /**
   * 分析需要清理的 import
   * 支援部分清理：當 import { A, B, C } 中只有部分符號未使用時，保留其他符號
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

      // 解析 import 語句（以語句為單位）
      const importStatements = this.parseImportStatements(content);
      const fileRemovals = removals.filter(r => r.filePath === filePath);

      for (const stmt of importStatements) {
        // 找出此 import 中需要清理的符號
        const unusedSymbols: string[] = [];
        const usedSymbols: string[] = [];

        for (const symbol of stmt.symbols) {
          // 符號是否在被刪除的列表中，且刪除後不再使用
          if (removedSymbols.has(symbol.name)) {
            const stillUsed = this.isImportStillUsed(content, symbol.name, fileRemovals);
            if (!stillUsed) {
              unusedSymbols.push(symbol.name);
            } else {
              usedSymbols.push(symbol.name);
            }
          } else {
            usedSymbols.push(symbol.name);
          }
        }

        // 沒有需要清理的符號，跳過
        if (unusedSymbols.length === 0) {
          continue;
        }

        // 判斷清理類型
        if (usedSymbols.length === 0) {
          // 所有符號都未使用，刪除整行
          cleanups.push({
            filePath,
            range: stmt.range,
            originalImport: stmt.statement,
            unusedSymbols,
            cleanupType: 'delete'
          });
        } else {
          // 部分符號仍在使用，產生新的 import 語句
          const newImport = this.generatePartialImport(stmt, usedSymbols);
          if (newImport) {
            cleanups.push({
              filePath,
              range: stmt.range,
              originalImport: stmt.statement,
              unusedSymbols,
              cleanupType: 'partial',
              newImport
            });
          }
        }
      }
    }

    return cleanups;
  }

  /**
   * 產生部分清理後的 import 語句
   */
  private generatePartialImport(
    stmt: ImportStatementInfo,
    usedSymbols: string[]
  ): string | null {
    // Default import 或 namespace import 不支援部分清理
    if (stmt.hasDefault || stmt.isNamespace) {
      return null;
    }

    // 從原始語句中提取 from 路徑
    const fromMatch = stmt.statement.match(/from\s+(['"])(.+?)\1/);
    if (!fromMatch) {
      return null;
    }
    const fromPath = fromMatch[2];
    const quote = fromMatch[1];

    // 保留別名資訊
    const symbolsWithAlias = usedSymbols.map(name => {
      const symbol = stmt.symbols.find(s => s.name === name);
      return symbol?.alias ? `${name} as ${symbol.alias}` : name;
    });

    // 判斷是否需要 type 關鍵字
    const isTypeImport = stmt.statement.match(/import\s+type\s*\{/);
    const typePrefix = isTypeImport ? 'type ' : '';

    return `import ${typePrefix}{ ${symbolsWithAlias.join(', ')} } from ${quote}${fromPath}${quote};`;
  }

  /**
   * 解析 import 語句（以語句為單位）
   * 支援 named import, default import, namespace import, 多行 import
   */
  private parseImportStatements(content: string): ImportStatementInfo[] {
    const statements: ImportStatementInfo[] = [];
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

        // 檢測結束條件：有 from 和 引號，或超過安全限制
        const cleanLine = line.replace(/\/\/.*/, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const isComplete = cleanLine.includes('from') && /['"]/.test(cleanLine);
        const isOverLimit = multiLineCount > MAX_MULTILINE_IMPORT;

        if (isComplete || isOverLimit) {
          // 多行 import 結束
          const stmt = this.parseImportStatementLine(multiLineImport, multiLineStartLine, lineNumber, lines);
          if (stmt) {
            statements.push(stmt);
          }
          multiLineImport = '';
          multiLineStartLine = -1;
          multiLineCount = 0;
        }
        continue;
      }

      // 檢查是否為多行 import 開始（有 { 但沒有 } 或沒有 from）
      if (line.match(/^\s*import\s+(?:type\s*)?\{/) && !line.includes('}')) {
        multiLineImport = line;
        multiLineStartLine = lineNumber;
        multiLineCount = 1;
        continue;
      }

      // 單行處理
      const stmt = this.parseImportStatementLine(line, lineNumber, lineNumber, lines);
      if (stmt) {
        statements.push(stmt);
      }
    }

    return statements;
  }

  /**
   * 解析單行或合併後的 import 語句
   */
  private parseImportStatementLine(
    line: string,
    startLine: number,
    endLine: number,
    lines: string[]
  ): ImportStatementInfo | null {
    const trimmedLine = line.replace(/\s+/g, ' ').trim();

    // 不是 import 語句
    if (!trimmedLine.startsWith('import ')) {
      return null;
    }

    // Side-effect import: import '...' (沒有符號)
    if (trimmedLine.match(/^import\s+['"][^'"]+['"]/)) {
      return null;
    }

    const range: Range = {
      start: { line: startLine, column: 1, offset: undefined },
      end: { line: endLine, column: (lines[endLine - 1] || '').length + 1, offset: undefined }
    };

    const symbols: ImportSymbolInfo[] = [];
    let hasDefault = false;
    let isNamespace = false;

    // 1. Namespace import: import * as X from '...'
    const namespaceMatch = trimmedLine.match(/import\s+\*\s+as\s+(\w+)\s+from/);
    if (namespaceMatch) {
      symbols.push({ name: namespaceMatch[1], isNamespace: true });
      isNamespace = true;
      return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
    }

    // 2. Default import with named: import X, { Y, Z } from '...'
    const defaultWithNamedMatch = trimmedLine.match(/import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from/);
    if (defaultWithNamedMatch) {
      hasDefault = true;
      symbols.push({ name: defaultWithNamedMatch[1], isDefault: true });
      this.parseNamedSymbols(defaultWithNamedMatch[2], symbols);
      return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
    }

    // 3. Default import only: import X from '...'
    const defaultMatch = trimmedLine.match(/import\s+(\w+)\s+from\s+['"]/);
    if (defaultMatch && !trimmedLine.includes('{')) {
      hasDefault = true;
      symbols.push({ name: defaultMatch[1], isDefault: true });
      return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
    }

    // 4. Named import: import { X, Y } from '...' or import type { X } from '...'
    const namedImportMatch = trimmedLine.match(/import\s+(?:type\s*)?\{([^}]+)\}\s*from/);
    if (namedImportMatch) {
      this.parseNamedSymbols(namedImportMatch[1], symbols);
      if (symbols.length > 0) {
        return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
      }
    }

    return null;
  }

  /**
   * 解析 named import 中的符號
   */
  private parseNamedSymbols(symbolsStr: string, symbols: ImportSymbolInfo[]): void {
    const parts = symbolsStr.split(',').map(s => s.trim());
    for (const part of parts) {
      // 跳過空字串和 type-only imports
      if (!part || part.startsWith('type ')) {
        continue;
      }

      // 處理 as 別名: X as Y
      const asMatch = part.match(/^(\w+)\s+as\s+(\w+)$/);
      if (asMatch) {
        symbols.push({ name: asMatch[1], alias: asMatch[2] });
      } else {
        const cleanSymbol = part.trim();
        if (cleanSymbol) {
          symbols.push({ name: cleanSymbol });
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
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'');

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

    // 對於 variable（可能是 arrow function），只有當包含 { 時才做括號匹配
    if (symbolType === 'variable') {
      const startLineContent = lines[range.start.line - 1] || '';
      // 檢查是否包含 arrow function 的 block body
      if (startLineContent.includes('=>') && startLineContent.includes('{')) {
        let braceCount = 0;
        let foundOpenBrace = false;

        for (let i = range.start.line - 1; i < lines.length; i++) {
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
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'');
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
   * 按檔案分組操作（去重相同 range）
   */
  private groupOperationsByFile(
    preview: DeadCodeRemovalPreview
  ): Map<string, FileOperation[]> {
    const fileOperations = new Map<string, FileOperation[]>();

    // 用於檢查 range 是否重複
    const rangeKey = (r: Range) => `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    const seenRanges = new Map<string, Set<string>>();

    const addOperation = (filePath: string, op: FileOperation) => {
      const existing = fileOperations.get(filePath) || [];
      const seen = seenRanges.get(filePath) || new Set();
      const key = rangeKey(op.range);

      // 去重：相同 range 只加入一次
      if (!seen.has(key)) {
        existing.push(op);
        seen.add(key);
        fileOperations.set(filePath, existing);
        seenRanges.set(filePath, seen);
      }
    };

    // 加入刪除操作
    for (const removal of preview.removals) {
      addOperation(removal.filePath, { range: removal.range, type: 'removal' });
    }

    // 加入 import 清理操作
    for (const cleanup of preview.importCleanups) {
      if (cleanup.cleanupType === 'partial' && cleanup.newImport) {
        addOperation(cleanup.filePath, {
          range: cleanup.range,
          type: 'import-partial',
          newContent: cleanup.newImport
        });
      } else {
        addOperation(cleanup.filePath, { range: cleanup.range, type: 'import-delete' });
      }
    }

    return fileOperations;
  }

  /**
   * 套用檔案操作
   */
  private async applyFileOperations(
    filePath: string,
    operations: FileOperation[]
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

      if (op.type === 'import-partial' && op.newContent) {
        // 部分清理：替換而非刪除
        if (startLine < lines.length && deleteCount > 0) {
          // 保留原始縮排
          const originalIndent = lines[startLine].match(/^(\s*)/)?.[1] || '';
          lines.splice(startLine, deleteCount, originalIndent + op.newContent);
        }
        cleanedImports++;
      } else {
        // 完整刪除
        if (startLine < lines.length && deleteCount > 0) {
          lines.splice(startLine, deleteCount);
        }

        if (op.type === 'removal') {
          removedSymbols++;
        } else {
          cleanedImports++;
        }
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
      // 清除可能存在的失敗快取，避免重試時仍返回 null
      this.fileCache.delete(filePath);
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
   * 檢查檔案路徑是否匹配排除模式
   * 支援 glob 模式（如 *.test.ts、**\/__tests__/**）和簡單字串匹配
   */
  private matchesExcludePattern(filePath: string, pattern: string): boolean {
    // 如果 pattern 包含 glob 特殊字符，使用 minimatch
    if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
      return minimatch(filePath, pattern, { dot: true, matchBase: true });
    }
    // 否則使用簡單字串包含匹配（向後相容）
    return filePath.includes(pattern);
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
  fileSystem: IFileSystem,
  options?: DeadCodeRemovalOptions
): DeadCodeRemover {
  return new DeadCodeRemover(fileSystem, options);
}
