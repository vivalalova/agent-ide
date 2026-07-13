/**
 * Import 解析器
 * 負責解析和更新程式碼中的 import 語句
 */

import * as path from 'path';
import { ImportStatement, ImportStatementType, PathType, ImportResolverConfig, ImportUpdate } from './types.js';
import { createPosition, createRange } from '@shared/types/core.js';

/**
 * Unicode 識別符字元類別（不含頭尾錨點），語意對應
 * plugins/shared/parser-helpers.ts 的 UNICODE_IDENTIFIER_PATTERN（UAX #31：
 * ID_Start / ID_Continue）。因架構限制 core 不可直接依賴 plugins（見
 * infrastructure/parser/initializer.ts 的橋接說明），故在此模組內本地定義同等
 * 字元類別，供下方 import 陳述式偵測正則辨識 Unicode 別名
 * （如 `import * as 工具 from '...'`，見 C6 regression）。
 */
const UNICODE_IDENTIFIER_CLASS = '[\\p{ID_Start}_$][\\p{ID_Continue}$]*';

/**
 * 匯入陳述式偵測用正則：辨識 `import ... from '...'`
 * （default / namespace / named / type-only 皆可），identifier 部分支援
 * Unicode（見 C6 regression）。套用 'u' flag 以啟用 \p{} 屬性跳脫。
 */
const IMPORT_STATEMENT_PATTERN = new RegExp(
  'import\\s+(?:type\\s+)?(?:(?:\\{[^}]*\\}|' + UNICODE_IDENTIFIER_CLASS + '|\\*\\s+as\\s+' + UNICODE_IDENTIFIER_CLASS + ')' +
    '(?:\\s*,\\s*(?:\\{[^}]*\\}|' + UNICODE_IDENTIFIER_CLASS + '|\\*\\s+as\\s+' + UNICODE_IDENTIFIER_CLASS + '))*\\s+from\\s+)?' +
    '[\'"`]([^\'"`]+)[\'"`]',
  'gu'
);

export class ImportResolver {
  private readonly config: ImportResolverConfig;
  private readonly aliasKeys: string[];

  constructor(config: ImportResolverConfig) {
    this.config = config;
    this.aliasKeys = Object.keys(config.pathAliases);
  }

  /**
   * 取得路徑別名映射
   * @returns 別名與實際路徑的映射物件
   */
  getPathAliases(): Record<string, string> {
    return this.config.pathAliases;
  }

  /**
   * 取得 baseUrl 設定
   * @returns baseUrl 絕對路徑，若無設定則返回 undefined
   */
  getBaseUrl(): string | undefined {
    return this.config.baseUrl;
  }

  /**
   * 分析 import 語句 (別名，保持向後相容)
   */
  analyzeImports(filePath: string, code: string): ImportStatement[] {
    return this.parseImportStatements(code, filePath);
  }

  /**
   * 解析程式碼中的 import 語句
   */
  parseImportStatements(code: string, _filePath: string): ImportStatement[] {
    const statements: ImportStatement[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 跳過註解行
      if (this.isCommentLine(line)) {
        continue;
      }

      // 解析 ES6 import（包含 import type 語法）
      const importStatement = this.collectMultilineImportStatement(lines, i);
      // 只有真正跨行的 import 語句（一個區塊只會有一筆 import）才用整段多行文字；
      // 單行內可能有多個 import 指向不同（或相同）模組，各自的 rawStatement 必須
      // 以「該 import 在行內的實際出現位置」（match[0]）切出，避免同行多筆 import
      // 共用同一份整行文字，造成後續去重誤判與替換錯位（見 C7 regression）
      const multilineSpan = importStatement && importStatement.endLineIndex > importStatement.startLineIndex
        ? importStatement
        : null;
      const searchText = importStatement?.statement ?? line;
      // 只在單行情境套用遮罩：字串字面值與行內註解可能包含長得像 import 陳述式
      // 的文字（如 "import { x } from './y'" 或 // import ... 註解），若不遮罩
      // 會被誤判成真正的 import（見 C5 regression）。跨行 import 語句本身已由
      // collectMultilineImportStatement 驗證過是真正的程式碼，不需要再遮罩。
      const maskedSearchText = multilineSpan ? searchText : this.maskStringsAndComments(searchText);
      const importMatches = maskedSearchText.matchAll(IMPORT_STATEMENT_PATTERN);
      for (const match of importMatches) {
        const matchIndex = match.index ?? 0;
        // 一律從「未遮罩」的原始文字切出對應片段：遮罩後的 match 只用來判斷
        // 「這裡是不是一個 import 陳述式」，真正的模組路徑與語句文字必須來自
        // 原文（遮罩版本引號內的內容只是佔位空白，不是真正路徑）。
        const originalMatchText = searchText.slice(matchIndex, matchIndex + match[0].length);
        const pathMatch = originalMatchText.match(/['"`]([^'"`]+)['"`]$/);
        if (!pathMatch) {
          continue;
        }
        const importPath = pathMatch[1];
        const rawStatementText = multilineSpan
          ? lines.slice(multilineSpan.startLineIndex, multilineSpan.endLineIndex + 1).join('\n')
          : this.appendTrailingSemicolonIfAdjacent(searchText, originalMatchText, matchIndex);
        const columnIndex = multilineSpan
          ? lines[multilineSpan.startLineIndex].indexOf('import')
          : matchIndex;
        const statement = this.createImportStatement(
          ImportStatementType.IMPORT,
          importPath,
          importStatement ? importStatement.startLineIndex + 1 : lineNumber,
          columnIndex,
          rawStatementText
        );
        if (statement) {
          statements.push(statement);
        }
      }
      if (importStatement && importStatement.endLineIndex > importStatement.startLineIndex) {
        i = importStatement.endLineIndex;
        continue;
      }

      // 解析 ES6 export from（包含單行和多行）
      if (line.includes('export')) {
        // 收集多行 export 語句
        const exportStatement = this.collectMultilineExportStatement(lines, i);
        if (exportStatement) {
          const { statement: fullStatement, endLineIndex, startLineIndex } = exportStatement;
          // 在完整語句中查找 from '../../../move/...'
          const fromMatch = fullStatement.match(/from\s+['"`]([^'"`]+)['"`]/);
          if (fromMatch) {
            const importPath = fromMatch[1];
            // 使用起始行號和原始多行語句
            const rawStatement = lines.slice(startLineIndex, endLineIndex + 1).join('\n');
            const statement = this.createImportStatement(ImportStatementType.EXPORT, importPath, startLineIndex + 1, lines[startLineIndex].indexOf('export'), rawStatement);
            if (statement) {
              statements.push(statement);
            }
          }
          // 跳過已處理的行
          i = endLineIndex;
          continue;
        }
      }

      // 解析 CommonJS require
      const requireMatches = line.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
      for (const match of requireMatches) {
        const importPath = match[1];
        const statement = this.createImportStatement(ImportStatementType.REQUIRE, importPath, lineNumber, line.length - line.trimStart().length, line);
        if (statement) {
          statements.push(statement);
        }
      }

      // 解析動態 import
      const dynamicImportMatches = line.matchAll(/import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
      for (const match of dynamicImportMatches) {
        const importPath = match[1];
        const statement = this.createImportStatement(ImportStatementType.DYNAMIC_IMPORT, importPath, lineNumber, line.length - line.trimStart().length, line);
        if (statement) {
          statements.push(statement);
        }
      }
    }

    return statements;
  }

  /**
   * 單行 import 的 rawStatement 若緊接著一個 `;`，把它併入 rawStatement，
   * 使輸出（pathUpdates 的 oldImport/newImport）與修復同行多 import 去重問題前
   * 的逐字語句保持一致。不影響去重鍵唯一性：唯一性來自 matchedText 本身
   * （不同 specifier 的文字本就不同），加不加分號都唯一。
   */
  private appendTrailingSemicolonIfAdjacent(searchText: string, matchedText: string, matchIndex: number): string {
    const nextCharIndex = matchIndex + matchedText.length;
    return searchText[nextCharIndex] === ';' ? matchedText + ';' : matchedText;
  }

  /**
   * 遮罩字串字面值與註解，避免內容中長得像 import 陳述式的文字被誤判為真正的
   * import（見 C5 regression：字串字面值 "import ... from './x'" 或行內註解
   * // import ... from './x' 不應被當成真正的 import）。
   *
   * 遮罩只清空字串內容與註解本身、保留引號與逐字元長度，讓後續的 import
   * 偵測正則仍能以相同的字元位置比對；真正的路徑內容一律從遮罩前的原始文字
   * 重新切出（見呼叫端 originalMatchText），遮罩版本只用於「這裡是不是一個
   * import 陳述式」的形狀判斷。
   *
   * 僅處理單行範圍內的字串／註解；跨行字串或區塊註解的延續行已由既有的
   * isCommentLine／collectMultilineImportStatement 邏輯另行處理，不在此方法範圍內。
   */
  private maskStringsAndComments(line: string): string {
    let result = '';
    let i = 0;
    const length = line.length;

    while (i < length) {
      const char = line[i];

      // 行內註解：// 之後直到行尾全部遮罩
      if (char === '/' && line[i + 1] === '/') {
        result += ' '.repeat(length - i);
        break;
      }

      // 同行內的區塊註解：/* ... */
      if (char === '/' && line[i + 1] === '*') {
        const endIndex = line.indexOf('*/', i + 2);
        if (endIndex === -1) {
          result += ' '.repeat(length - i);
          break;
        }
        result += ' '.repeat(endIndex + 2 - i);
        i = endIndex + 2;
        continue;
      }

      // 字串字面值（單引號、雙引號、模板字面值）：保留引號本身，遮罩內容
      if (char === '\'' || char === '"' || char === '`') {
        const quote = char;
        let j = i + 1;
        let closed = false;
        while (j < length) {
          if (line[j] === '\\') {
            j += 2;
            continue;
          }
          if (line[j] === quote) {
            closed = true;
            break;
          }
          j++;
        }
        result += quote;
        if (closed) {
          result += ' '.repeat(j - i - 1);
          result += quote;
          i = j + 1;
        } else {
          result += ' '.repeat(length - i - 1);
          i = length;
        }
        continue;
      }

      result += char;
      i++;
    }

    return result;
  }

  /**
   * 收集多行的 import 語句。
   */
  private collectMultilineImportStatement(lines: string[], startIndex: number): { statement: string; endLineIndex: number; startLineIndex: number } | null {
    const startLine = lines[startIndex];
    if (!startLine.includes('import') || /\bimport\s*\(/.test(startLine)) {
      return null;
    }

    if (this.isCompleteImportStatement(startLine)) {
      return { statement: startLine, endLineIndex: startIndex, startLineIndex: startIndex };
    }

    let fullStatement = startLine;
    for (let i = startIndex + 1; i < lines.length; i++) {
      fullStatement += ' ' + lines[i].trim();
      if (this.isCompleteImportStatement(fullStatement)) {
        return { statement: fullStatement, endLineIndex: i, startLineIndex: startIndex };
      }
      if (i - startIndex > 200) {
        break;
      }
    }

    return null;
  }

  private isCompleteImportStatement(statement: string): boolean {
    return /import\s+(?:type\s+)?(?:(?:\{[\s\S]*\}|\w+|\*\s+as\s+\w+)(?:\s*,\s*(?:\{[\s\S]*\}|\w+|\*\s+as\s+\w+))*\s+from\s+)?['"`][^'"`]+['"`]/.test(statement);
  }

  /**
   * 收集多行的 export 語句
   */
  private collectMultilineExportStatement(lines: string[], startIndex: number): { statement: string; endLineIndex: number; startLineIndex: number } | null {
    const startLine = lines[startIndex];
    if (!startLine.includes('export')) {
      return null;
    }

    // 判斷「這行是否真的含 from '...'」一律用遮罩後文字：字串字面值與行內註解
    // 中長得像 re-export 的文字（如 "... from './x'" 或 // ... from './x'）
    // 不應被誤判成真正的 export ... from（見 C5 regression）。回傳的 statement
    // 仍是原始未遮罩文字，供呼叫端取得真正的路徑內容。
    const maskedStartLine = this.maskStringsAndComments(startLine);

    // 如果 export 和 from 在同一行，直接返回
    if (maskedStartLine.includes('from') && maskedStartLine.match(/from\s+['"`]/)) {
      return { statement: startLine, endLineIndex: startIndex, startLineIndex: startIndex };
    }

    // 收集多行直到找到 from
    let fullStatement = startLine;
    for (let i = startIndex + 1; i < lines.length; i++) {
      fullStatement += ' ' + lines[i].trim();
      const maskedLine = this.maskStringsAndComments(lines[i]);
      if (maskedLine.includes('from') && maskedLine.match(/from\s+['"`]/)) {
        return { statement: fullStatement, endLineIndex: i, startLineIndex: startIndex };
      }
      // 最多往後看 10 行
      if (i - startIndex > 10) {
        break;
      }
    }

    return null;
  }

  /**
  /**
   * 更新 import 路徑
   */
  updateImportPath(
    importStatement: ImportStatement,
    oldFilePath: string,
    newFilePath: string
  ): ImportUpdate {
    const { path: importPath, rawStatement, position } = importStatement;

    // 如果是 Node 模組，不需要更新
    if (this.isNodeModuleImport(importPath)) {
      return {
        filePath: oldFilePath,
        line: position.line,
        oldImport: rawStatement,
        newImport: rawStatement,
        success: true
      };
    }

    try {
      let newImportPath = importPath;

      if (importStatement.pathType === PathType.RELATIVE) {
        // 計算新的相對路徑
        const currentDir = path.dirname(oldFilePath);
        const targetPath = path.resolve(currentDir, importPath);
        const newDir = path.dirname(newFilePath);
        newImportPath = this.calculateRelativePath(newDir, targetPath);
      } else if (importStatement.pathType === PathType.ALIAS) {
        // 解析別名並重新計算
        const resolvedPath = this.resolvePathAlias(importPath);
        if (resolvedPath !== importPath) {
          const absoluteTargetPath = path.resolve(resolvedPath);
          newImportPath = this.calculateRelativePath(newFilePath, absoluteTargetPath);
        }
      }

      // 更新 import 語句
      const newStatement = rawStatement.replace(
        new RegExp(`['"\`]${this.escapeRegExp(importPath)}['"\`]`),
        `'${newImportPath}'`
      );

      return {
        filePath: oldFilePath,
        line: position.line,
        oldImport: rawStatement,
        newImport: newStatement,
        success: true
      };
    } catch (error) {
      return {
        filePath: oldFilePath,
        line: position.line,
        oldImport: rawStatement,
        newImport: rawStatement,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 解析路徑別名
   * 返回絕對路徑（如果 pathAliases 中的值是絕對路徑）
   */
  resolvePathAlias(aliasPath: string): string {
    const { pathAliases } = this.config;

    for (const [alias, realPath] of Object.entries(pathAliases)) {
      // 精確匹配：alias 本身或 alias/ 開頭
      if (aliasPath === alias || aliasPath.startsWith(alias + '/')) {
        // 移除前導的 / 以避免 path.join 的問題
        const remainingPath = aliasPath.slice(alias.length).replace(/^\//, '');
        // 使用 path.join 拼接，保持 realPath 的格式（絕對或相對）
        const resolved = path.join(realPath, remainingPath);

        // 統一使用正斜線（跨平台）
        return resolved.replace(/\\/g, '/');
      }
    }

    return aliasPath;
  }

  /**
   * 計算相對路徑
   */
  calculateRelativePath(fromPath: string, toPath: string): string {
    // 如果 fromPath 是檔案，取其目錄
    const fromDir = path.extname(fromPath) ? path.dirname(fromPath) : fromPath;
    let relativePath = path.relative(fromDir, toPath);

    // 移除副檔名（如果目標是受支援的檔案類型）
    const ext = path.extname(relativePath);
    if (this.config.supportedExtensions.includes(ext)) {
      relativePath = relativePath.slice(0, -ext.length);
    }

    // 確保相對路徑以 ./ 或 ../ 開始
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 統一使用正斜線
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * 提取 import 語句中的符號
   */
  findImportedSymbols(statement: string): string[] {
    const symbols: string[] = [];

    // 處理混合 import: import React, { Component, useState } from 'react'
    const mixedImportMatch = statement.match(/import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from/);
    if (mixedImportMatch) {
      symbols.push(mixedImportMatch[1]); // 預設 import
      const namedImports = mixedImportMatch[2]
        .split(',')
        .map(item => {
          const trimmed = item.trim();
          // 處理別名: Component as Comp
          const aliasMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
          return aliasMatch ? aliasMatch[2] : trimmed;
        })
        .filter(Boolean);
      symbols.push(...namedImports);
      return symbols;
    }

    // 處理預設 import: import React from 'react'
    const defaultImportMatch = statement.match(/import\s+(\w+)\s+from/);
    if (defaultImportMatch) {
      symbols.push(defaultImportMatch[1]);
    }

    // 處理具名 import: import { Component, useState } from 'react'
    const namedImportMatch = statement.match(/import\s+\{([^}]+)\}/);
    if (namedImportMatch) {
      const namedImports = namedImportMatch[1]
        .split(',')
        .map(item => {
          const trimmed = item.trim();
          // 處理別名: Component as Comp
          const aliasMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
          return aliasMatch ? aliasMatch[2] : trimmed;
        })
        .filter(Boolean);

      symbols.push(...namedImports);
    }

    // 處理 namespace import: import * as React from 'react'
    const namespaceImportMatch = statement.match(/import\s+\*\s+as\s+(\w+)/);
    if (namespaceImportMatch) {
      symbols.push(namespaceImportMatch[1]);
    }

    return symbols;
  }

  /**
   * 檢查是否為 Node 模組 import
   */
  isNodeModuleImport(importPath: string): boolean {
    // 相對路徑不是 Node 模組
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return false;
    }

    // 檢查是否為路徑別名（使用快取的 aliasKeys）
    for (const alias of this.aliasKeys) {
      if (importPath === alias || importPath.startsWith(alias + '/')) {
        return false;
      }
    }

    // 檢查是否為 baseUrl 相對路徑（如 src/utils）
    // TypeScript 允許在設定 baseUrl 時使用非 ./ 開頭的路徑
    if (this.config.baseUrl) {
      // 如果路徑包含 /，且第一段是常見的專案目錄名稱，視為 baseUrl 相對路徑
      const firstSegment = importPath.split('/')[0];
      // 常見的專案源碼目錄
      const projectDirs = ['src', 'lib', 'app', 'source', 'packages', 'modules'];
      if (projectDirs.includes(firstSegment)) {
        return false;
      }
    }

    // 其他都視為 Node 模組（包括 scoped packages）
    return true;
  }

  /**
   * 建立 ImportStatement 物件
   */
  private createImportStatement(
    type: ImportStatementType,
    importPath: string,
    lineNumber: number,
    columnIndex: number,
    rawStatement: string
  ): ImportStatement | null {
    // columnIndex 必須指向 rawStatement trim 後在該行的起始位置，供下游以 column 錨定替換。
    const position = createPosition(lineNumber, columnIndex + 1);
    const range = createRange(position, createPosition(lineNumber, columnIndex + rawStatement.length));

    const pathType = this.determinePathType(importPath);
    const isRelative = pathType === PathType.RELATIVE;

    const importedSymbols = type === ImportStatementType.IMPORT ? this.findImportedSymbols(rawStatement) : undefined;

    return {
      type,
      path: importPath,
      pathType,
      position,
      range,
      isRelative,
      importedSymbols,
      rawStatement: rawStatement.trim()
    };
  }

  /**
   * 判斷路徑型別
   */
  private determinePathType(importPath: string): PathType {
    if (importPath.startsWith('.')) {
      return PathType.RELATIVE;
    }

    // 檢查是否為路徑別名（使用快取的 aliasKeys）
    for (const alias of this.aliasKeys) {
      if (importPath.startsWith(alias)) {
        return PathType.ALIAS;
      }
    }

    return PathType.ABSOLUTE;
  }

  /**
   * 跳脫正則表達式特殊字元
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 檢查是否為註解行
   */
  private isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') ||
           trimmed.startsWith('/*') ||
           trimmed.startsWith('*');
  }
}
