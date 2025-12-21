/**
 * Import 清理工具
 * 負責分析和清理未使用的 import
 */

import type { Range } from '@shared/types/core.js';
import type { SymbolFinder } from '@core/shared/symbol-finder/index.js';
import { SymbolReferenceType } from '@core/shared/symbol-finder/index.js';
import type { RemovalOperation, ImportCleanupOperation } from './types.js';

/**
 * Import 語句中的符號資訊
 */
export interface ImportSymbolInfo {
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
export interface ImportStatementInfo {
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
 * 檔案讀取介面
 */
export interface FileReader {
  readFile(filePath: string): Promise<string | null>;
}

/**
 * 分析需要清理的 import
 * 支援部分清理：當 import { A, B, C } 中只有部分符號未使用時，保留其他符號
 */
export async function analyzeImportCleanups(
  removals: readonly RemovalOperation[],
  fileReader: FileReader,
  symbolFinder: SymbolFinder
): Promise<{ cleanups: ImportCleanupOperation[]; warnings: string[] }> {
  const cleanups: ImportCleanupOperation[] = [];
  const warnings: string[] = [];
  const affectedFiles = new Set(removals.map(r => r.filePath));
  const removedSymbols = new Set(removals.map(r => r.symbolName));

  for (const filePath of affectedFiles) {
    const content = await fileReader.readFile(filePath);
    if (!content) {
      warnings.push(`跳過 import 清理：無法讀取檔案 ${filePath}`);
      continue;
    }

    // 解析 import 語句（以語句為單位）
    const importStatements = parseImportStatements(content);
    const fileRemovals = removals.filter(r => r.filePath === filePath);

    for (const stmt of importStatements) {
      // 找出此 import 中需要清理的符號
      const unusedSymbols: string[] = [];
      const usedSymbols: string[] = [];

      for (const symbol of stmt.symbols) {
        // 符號是否在被刪除的列表中，且刪除後不再使用
        if (removedSymbols.has(symbol.name)) {
          const stillUsed = await isImportStillUsed(filePath, symbol.name, fileRemovals, symbolFinder);
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
        const newImport = generatePartialImport(stmt, usedSymbols);
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

  return { cleanups, warnings };
}

/**
 * 產生部分清理後的 import 語句
 * 支援：純 named import、混合 default + named import
 */
export function generatePartialImport(
  stmt: ImportStatementInfo,
  usedSymbols: string[]
): string | null {
  // Namespace import 不支援部分清理（整體使用）
  if (stmt.isNamespace) {
    return null;
  }

  // 從原始語句中提取 from 路徑
  const fromMatch = stmt.statement.match(/from\s+(['"])(.+?)\1/);
  if (!fromMatch) {
    return null;
  }
  const fromPath = fromMatch[2];
  const quote = fromMatch[1];

  // 分離 default 和 named symbols
  const defaultSymbol = stmt.symbols.find(s => s.isDefault);
  const namedSymbols = stmt.symbols.filter(s => !s.isDefault);

  // 檢查 default import 是否仍需保留
  const keepDefault = defaultSymbol && usedSymbols.includes(defaultSymbol.name);

  // 過濾出需要保留的 named symbols，並保留別名資訊
  // 同時檢查 name 和 alias，因為 usedSymbols 可能包含別名
  const keptNamedSymbols = namedSymbols
    .filter(s => usedSymbols.includes(s.name) || (s.alias && usedSymbols.includes(s.alias)))
    .map(s => s.alias ? `${s.name} as ${s.alias}` : s.name);

  // 判斷是否需要 type 關鍵字（僅對純 named import）
  const isTypeImport = stmt.statement.match(/import\s+type\s*\{/);
  const typePrefix = isTypeImport ? 'type ' : '';

  // 建構新的 import 語句
  if (keepDefault && keptNamedSymbols.length > 0) {
    // 混合格式：import X, { Y, Z } from '...'
    return `import ${defaultSymbol!.name}, { ${keptNamedSymbols.join(', ')} } from ${quote}${fromPath}${quote};`;
  } else if (keepDefault) {
    // 只有 default：import X from '...'
    return `import ${defaultSymbol!.name} from ${quote}${fromPath}${quote};`;
  } else if (keptNamedSymbols.length > 0) {
    // 只有 named：import { Y, Z } from '...'
    return `import ${typePrefix}{ ${keptNamedSymbols.join(', ')} } from ${quote}${fromPath}${quote};`;
  }

  // 沒有任何符號需要保留
  return null;
}

/**
 * 解析 import 語句（以語句為單位）
 * 支援 named import, default import, namespace import, 多行 import
 */
export function parseImportStatements(content: string): ImportStatementInfo[] {
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
        const stmt = parseImportStatementLine(multiLineImport, multiLineStartLine, lineNumber, lines);
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
    const stmt = parseImportStatementLine(line, lineNumber, lineNumber, lines);
    if (stmt) {
      statements.push(stmt);
    }
  }

  return statements;
}

/**
 * 解析單行或合併後的 import 語句
 */
export function parseImportStatementLine(
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
    parseNamedSymbols(defaultWithNamedMatch[2], symbols);
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
    parseNamedSymbols(namedImportMatch[1], symbols);
    if (symbols.length > 0) {
      return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
    }
  }

  return null;
}

/**
 * 解析 named import 中的符號
 */
export function parseNamedSymbols(symbolsStr: string, symbols: ImportSymbolInfo[]): void {
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
 * 使用 SymbolFinder.findReferencesInFile 進行語義分析
 */
export async function isImportStillUsed(
  filePath: string,
  symbolName: string,
  removalsInFile: readonly RemovalOperation[],
  symbolFinder: SymbolFinder
): Promise<boolean> {
  // 使用 SymbolFinder 查找該檔案中的所有引用
  const references = await symbolFinder.findReferencesInFile(filePath, symbolName);

  // 過濾掉 import 類型的引用（import 語句本身）
  const usageRefs = references.filter(ref => ref.type === SymbolReferenceType.Usage);

  // 過濾掉被刪除程式碼區塊內的引用
  const remainingRefs = usageRefs.filter(ref => {
    const refLine = ref.location.range.start.line;
    // 檢查引用是否在任一刪除範圍內
    for (const removal of removalsInFile) {
      if (refLine >= removal.range.start.line && refLine <= removal.range.end.line) {
        return false; // 在刪除範圍內，過濾掉
      }
    }
    return true;
  });

  // 如果還有剩餘的使用引用，表示 import 仍需要
  return remainingRefs.length > 0;
}
