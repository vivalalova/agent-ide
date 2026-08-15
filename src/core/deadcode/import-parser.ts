/**
 * Import 語句解析器
 * 負責解析 TypeScript/JavaScript 的 import 語句
 */

import type { Range } from '@shared/types/core.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ImportDeclaration } from '@infrastructure/parser/interface.js';
import { FileUtils } from '@core/foundations/index.js';

/** 多行 import 的最大行數限制 */
const MAX_MULTILINE_IMPORT = 20;

/**
 * Unicode 識別符字元類（不含錨點），與 move/statement-collector、import-resolver 同形
 * （UAX #31 ID_Start/ID_Continue + `$`）。deadcode 不依賴 move 層，故本地定義同等字元類。
 */
export const UNICODE_IDENTIFIER_CLASS = '[\\p{ID_Start}_$][\\p{ID_Continue}$]*';

/**
 * Import 語句匹配 Regex 常數
 * 識別符一律用 UNICODE_IDENTIFIER_CLASS（UAX #31），禁止 \w+（會漏 Unicode 別名）
 */
const IMPORT_PATTERNS = {
  /** Namespace import: import * as X from '...' */
  NAMESPACE: new RegExp(
    'import\\s+\\*\\s+as\\s+(' + UNICODE_IDENTIFIER_CLASS + ')\\s+from',
    'u'
  ),
  /** Default import with named: import X, { Y, Z } from '...' */
  DEFAULT_WITH_NAMED: new RegExp(
    'import\\s+(' + UNICODE_IDENTIFIER_CLASS + ')\\s*,\\s*\\{([^}]+)\\}\\s*from',
    'u'
  ),
  /** Default import only: import X from '...' */
  DEFAULT_ONLY: new RegExp(
    'import\\s+(' + UNICODE_IDENTIFIER_CLASS + ')\\s+from\\s+[\'"]',
    'u'
  ),
  /** Named import: import { X, Y } from '...' or import type { X } from '...' */
  NAMED: /import\s+(?:type\s*)?\{([^}]+)\}\s*from/,
  /** Side-effect import: import '...' */
  SIDE_EFFECT: /^import\s+['"][^'"]+['"]/,
  /** As alias: X as Y */
  AS_ALIAS: new RegExp(
    '^(' + UNICODE_IDENTIFIER_CLASS + ')\\s+as\\s+(' + UNICODE_IDENTIFIER_CLASS + ')$',
    'u'
  )
} as const;

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
 * Import 語句解析器
 */
export class ImportParser {
  constructor(private readonly parserRegistry: ParserRegistry) {}

  /**
   * 解析 import 語句（以語句為單位）
   * 優先使用 Parser 的 AST 解析（精確），fallback 到字串解析（向後相容）
   * @param content 檔案內容
   * @param filePath 檔案路徑（用於取得對應的 Parser）
   */
  parseImportStatements(content: string, filePath: string): ImportStatementInfo[] {
    // 1. 優先嘗試使用 Parser 的 getImportDeclarations 方法
    const parserResult = this.parseImportStatementsWithParser(content, filePath);
    if (parserResult) {
      return parserResult;
    }

    // 2. Fallback：使用原有的字串解析邏輯
    return this.parseImportStatementsFallback(content);
  }

  /**
   * 使用 Parser AST 解析 import 語句
   * @returns ImportStatementInfo[] 如果成功，null 如果 Parser 不支援或解析失敗
   */
  private parseImportStatementsWithParser(content: string, filePath: string): ImportStatementInfo[] | null {
    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (!parser?.getImportDeclarations) {
      return null;
    }

    const declarations = parser.getImportDeclarations(content);
    if (!declarations) {
      return null;
    }

    // 將 Parser 的 ImportDeclaration 轉換為內部的 ImportStatementInfo
    return declarations.map(decl => this.convertImportDeclaration(decl));
  }

  /**
   * 將 Parser 的 ImportDeclaration 轉換為內部的 ImportStatementInfo
   */
  private convertImportDeclaration(decl: ImportDeclaration): ImportStatementInfo {
    const symbols: ImportSymbolInfo[] = [];

    // 處理 default import
    if (decl.defaultImport) {
      symbols.push({ name: decl.defaultImport, isDefault: true });
    }

    // 處理 namespace import
    if (decl.namespaceImport) {
      symbols.push({ name: decl.namespaceImport, isNamespace: true });
    }

    // 處理 named imports（防禦性檢查：decl.namedImports 可能為 undefined）
    for (const named of decl.namedImports ?? []) {
      symbols.push({
        name: named.name,
        alias: named.alias
      });
    }

    return {
      statement: decl.rawStatement,
      range: decl.range,
      symbols,
      hasDefault: !!decl.defaultImport,
      isNamespace: !!decl.namespaceImport
    };
  }

  /**
   * Fallback：使用字串解析 import 語句
   * 保留原有邏輯以確保向後相容
   */
  private parseImportStatementsFallback(content: string): ImportStatementInfo[] {
    const statements: ImportStatementInfo[] = [];
    const lines = content.split('\n');

    // 用於處理多行 import
    let multiLineImport = '';
    let multiLineStartLine = -1;
    let multiLineCount = 0;

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
    if (IMPORT_PATTERNS.SIDE_EFFECT.test(trimmedLine)) {
      return null;
    }

    const range: Range = {
      start: { line: startLine, column: 1 },
      end: { line: endLine, column: (lines[endLine - 1] || '').length + 1 }
    };

    const symbols: ImportSymbolInfo[] = [];
    let hasDefault = false;
    let isNamespace = false;

    // 1. Namespace import: import * as X from '...'
    const namespaceMatch = trimmedLine.match(IMPORT_PATTERNS.NAMESPACE);
    if (namespaceMatch) {
      symbols.push({ name: namespaceMatch[1], isNamespace: true });
      isNamespace = true;
      return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
    }

    // 2. Default import with named: import X, { Y, Z } from '...'
    const defaultWithNamedMatch = trimmedLine.match(IMPORT_PATTERNS.DEFAULT_WITH_NAMED);
    if (defaultWithNamedMatch) {
      hasDefault = true;
      symbols.push({ name: defaultWithNamedMatch[1], isDefault: true });
      this.parseNamedSymbols(defaultWithNamedMatch[2], symbols);
      return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
    }

    // 3. Default import only: import X from '...'
    const defaultMatch = trimmedLine.match(IMPORT_PATTERNS.DEFAULT_ONLY);
    if (defaultMatch && !trimmedLine.includes('{')) {
      hasDefault = true;
      symbols.push({ name: defaultMatch[1], isDefault: true });
      return { statement: trimmedLine, range, symbols, hasDefault, isNamespace };
    }

    // 4. Named import: import { X, Y } from '...' or import type { X } from '...'
    const namedImportMatch = trimmedLine.match(IMPORT_PATTERNS.NAMED);
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
      const asMatch = part.match(IMPORT_PATTERNS.AS_ALIAS);
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
}

/**
 * 建立 ImportParser 實例
 */
export function createImportParser(parserRegistry: ParserRegistry): ImportParser {
  return new ImportParser(parserRegistry);
}
