/**
 * Import 解析器
 * 負責解析和更新程式碼中的 import 語句
 */

import * as path from 'path';
import { ImportStatement, PathType, ImportResolverConfig, ImportUpdate } from './types.js';
import { Position, createPosition, createRange } from '../../shared/types/core.js';

export class ImportResolver {
  private readonly config: ImportResolverConfig;

  constructor(config: ImportResolverConfig) {
    this.config = config;
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
  parseImportStatements(code: string, filePath: string): ImportStatement[] {
    const statements: ImportStatement[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 跳過註解行
      if (this.isCommentLine(line)) {
        continue;
      }

      // 解析 ES6 import
      const importMatches = line.matchAll(/import\s+(?:(?:\{[^}]*\}|\w+|\*\s+as\s+\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+|\*\s+as\s+\w+))*\s+from\s+)?['"`]([^'"`]+)['"`]/g);
      for (const match of importMatches) {
        const importPath = match[1];
        const statement = this.createImportStatement('import', importPath, lineNumber, match.index || 0, line);
        if (statement) {
          statements.push(statement);
        }
      }

      // 解析 ES6 export from（包含單行和多行）
      if (line.includes('export')) {
        // 收集多行 export 語句
        const exportStatement = this.collectMultilineExportStatement(lines, i);
        if (exportStatement) {
          const { statement: fullStatement, endLineIndex } = exportStatement;
          // 在完整語句中查找 from '...'
          const fromMatch = fullStatement.match(/from\s+['"`]([^'"`]+)['"`]/);
          if (fromMatch) {
            const importPath = fromMatch[1];
            // 使用 from 所在的行號
            const fromLineIndex = this.findFromLineIndex(lines, i, endLineIndex);
            const fromLine = lines[fromLineIndex];
            const statement = this.createImportStatement('export', importPath, fromLineIndex + 1, fromLine.indexOf('from'), fromLine);
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
        const statement = this.createImportStatement('require', importPath, lineNumber, match.index || 0, line);
        if (statement) {
          statements.push(statement);
        }
      }

      // 解析動態 import
      const dynamicImportMatches = line.matchAll(/import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
      for (const match of dynamicImportMatches) {
        const importPath = match[1];
        const statement = this.createImportStatement('dynamic_import', importPath, lineNumber, match.index || 0, line);
        if (statement) {
          statements.push(statement);
        }
      }
    }


    return statements;
  }

  /**
   * 收集多行的 export 語句
   */
  private collectMultilineExportStatement(lines: string[], startIndex: number): { statement: string; endLineIndex: number } | null {
    const startLine = lines[startIndex];
    if (!startLine.includes('export')) {
      return null;
    }

    // 如果 export 和 from 在同一行，直接返回
    if (startLine.includes('from') && startLine.match(/from\s+['"`]/)) {
      return { statement: startLine, endLineIndex: startIndex };
    }

    // 收集多行直到找到 from
    let fullStatement = startLine;
    for (let i = startIndex + 1; i < lines.length; i++) {
      fullStatement += ' ' + lines[i].trim();
      if (lines[i].includes('from') && lines[i].match(/from\s+['"`]/)) {
        return { statement: fullStatement, endLineIndex: i };
      }
      // 最多往後看 10 行
      if (i - startIndex > 10) {
        break;
      }
    }

    return null;
  }

  /**
   * 找出 from 關鍵字所在的行索引
   */
  private findFromLineIndex(lines: string[], startIndex: number, endIndex: number): number {
    for (let i = startIndex; i <= endIndex; i++) {
      if (lines[i].includes('from') && lines[i].match(/from\s+['"`]/)) {
        return i;
      }
    }
    return endIndex;
  }

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
   */
  resolvePathAlias(aliasPath: string): string {
    const { pathAliases } = this.config;

    for (const [alias, realPath] of Object.entries(pathAliases)) {
      if (aliasPath.startsWith(alias)) {
        // 確保路徑拼接正確
        // 移除前導的 / 以避免 path.join 的問題
        const remainingPath = aliasPath.slice(alias.length).replace(/^\//, '');
        let resolved = path.join(realPath, remainingPath).replace(/\\/g, '/');

        // 確保相對路徑以 ./ 開始
        if (!resolved.startsWith('.') && !path.isAbsolute(resolved)) {
          resolved = './' + resolved;
        }

        return resolved;
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

    // 檢查是否為路徑別名（必須精確匹配或以 alias/ 開始）
    for (const alias of Object.keys(this.config.pathAliases)) {
      if (importPath === alias || importPath.startsWith(alias + '/')) {
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
    type: 'import' | 'require' | 'dynamic_import' | 'export',
    importPath: string,
    lineNumber: number,
    columnIndex: number,
    rawStatement: string
  ): ImportStatement | null {
    const position = createPosition(lineNumber, columnIndex + 1);
    const range = createRange(position, createPosition(lineNumber, columnIndex + rawStatement.length));

    const pathType = this.determinePathType(importPath);
    const isRelative = pathType === PathType.RELATIVE;

    const importedSymbols = type === 'import' ? this.findImportedSymbols(rawStatement) : undefined;

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

    // 檢查是否為路徑別名
    for (const alias of Object.keys(this.config.pathAliases)) {
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