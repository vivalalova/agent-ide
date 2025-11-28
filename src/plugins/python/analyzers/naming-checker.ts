/**
 * Python 命名規範檢查器
 * 檢查 PEP8 命名規範
 */

import type { Symbol } from '@shared/types/index.js';
import { SymbolType } from '@shared/types/index.js';
import type { NamingIssue } from '@infrastructure/parser/analysis-types.js';
import { NAMING_PATTERNS } from '../types.js';

/**
 * Python 命名規範檢查器類別
 */
export class PythonNamingChecker {
  /**
   * 檢查命名規範問題
   */
  check(symbols: Symbol[], filePath: string): NamingIssue[] {
    const issues: NamingIssue[] = [];

    for (const symbol of symbols) {
      const issue = this.checkSymbolNaming(symbol, filePath);
      if (issue) {
        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * 檢查單個符號的命名
   */
  private checkSymbolNaming(symbol: Symbol, filePath: string): NamingIssue | null {
    const { name, type } = symbol;

    // 跳過特殊名稱
    if (this.isSpecialName(name)) {
      return null;
    }

    // 根據符號類型檢查命名
    switch (type) {
      case SymbolType.Class:
        return this.checkClassName(symbol, filePath);

      case SymbolType.Function:
        return this.checkFunctionName(symbol, filePath);

      case SymbolType.Variable:
        return this.checkVariableName(symbol, filePath);

      case SymbolType.Constant:
        return this.checkConstantName(symbol, filePath);

      case SymbolType.Module:
        return this.checkModuleName(symbol, filePath);

      default:
        return null;
    }
  }

  /**
   * 檢查類別名稱（應為 PascalCase）
   */
  private checkClassName(symbol: Symbol, filePath: string): NamingIssue | null {
    const { name } = symbol;

    if (!NAMING_PATTERNS.pascalCase.test(name)) {
      return {
        type: 'invalid-naming',
        symbolName: name,
        symbolType: 'class',
        location: {
          filePath,
          line: symbol.location.range.start.line,
          column: symbol.location.range.start.column
        },
        message: `類別名稱 '${name}' 應使用 PascalCase`,
        suggestedName: this.toPascalCase(name)
      };
    }

    return null;
  }

  /**
   * 檢查函式名稱（應為 snake_case）
   */
  private checkFunctionName(symbol: Symbol, filePath: string): NamingIssue | null {
    const { name } = symbol;

    // 私有方法可以用 _開頭
    if (name.startsWith('_')) {
      const privateName = name.substring(1);
      if (privateName.startsWith('_')) {
        // __dunder__ 方法
        return null;
      }
      if (!NAMING_PATTERNS.snakeCase.test(privateName) && privateName.length > 0) {
        return {
          type: 'invalid-naming',
          symbolName: name,
          symbolType: 'function',
          location: {
            filePath,
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          message: `私有函式名稱 '${name}' 應使用 _snake_case`,
          suggestedName: '_' + this.toSnakeCase(privateName)
        };
      }
      return null;
    }

    if (!NAMING_PATTERNS.snakeCase.test(name)) {
      return {
        type: 'invalid-naming',
        symbolName: name,
        symbolType: 'function',
        location: {
          filePath,
          line: symbol.location.range.start.line,
          column: symbol.location.range.start.column
        },
        message: `函式名稱 '${name}' 應使用 snake_case`,
        suggestedName: this.toSnakeCase(name)
      };
    }

    return null;
  }

  /**
   * 檢查變數名稱（應為 snake_case）
   */
  private checkVariableName(symbol: Symbol, filePath: string): NamingIssue | null {
    const { name } = symbol;

    // 跳過單字母變數（迴圈變數）
    if (name.length === 1) {
      return null;
    }

    // 私有變數
    if (name.startsWith('_') && !name.startsWith('__')) {
      return null;
    }

    // 檢查是否為常量（全大寫）
    if (NAMING_PATTERNS.upperSnakeCase.test(name)) {
      return null;
    }

    if (!NAMING_PATTERNS.snakeCase.test(name)) {
      return {
        type: 'invalid-naming',
        symbolName: name,
        symbolType: 'variable',
        location: {
          filePath,
          line: symbol.location.range.start.line,
          column: symbol.location.range.start.column
        },
        message: `變數名稱 '${name}' 應使用 snake_case`,
        suggestedName: this.toSnakeCase(name)
      };
    }

    return null;
  }

  /**
   * 檢查常量名稱（應為 UPPER_SNAKE_CASE）
   */
  private checkConstantName(symbol: Symbol, filePath: string): NamingIssue | null {
    const { name } = symbol;

    if (!NAMING_PATTERNS.upperSnakeCase.test(name)) {
      return {
        type: 'invalid-naming',
        symbolName: name,
        symbolType: 'constant',
        location: {
          filePath,
          line: symbol.location.range.start.line,
          column: symbol.location.range.start.column
        },
        message: `常量名稱 '${name}' 應使用 UPPER_SNAKE_CASE`,
        suggestedName: this.toUpperSnakeCase(name)
      };
    }

    return null;
  }

  /**
   * 檢查模組名稱（應為 snake_case）
   */
  private checkModuleName(symbol: Symbol, filePath: string): NamingIssue | null {
    // 模組名稱檢查通常基於檔案名稱，這裡跳過
    return null;
  }

  /**
   * 判斷是否為特殊名稱
   */
  private isSpecialName(name: string): boolean {
    // __dunder__ 方法
    if (name.startsWith('__') && name.endsWith('__')) {
      return true;
    }

    // 常見的簡短變數名
    const shortNames = new Set(['i', 'j', 'k', 'n', 'x', 'y', 'z', 'e', 'f', 'fd', 'id']);
    if (shortNames.has(name)) {
      return true;
    }

    // self, cls
    if (name === 'self' || name === 'cls') {
      return true;
    }

    return false;
  }

  /**
   * 轉換為 PascalCase
   */
  private toPascalCase(name: string): string {
    return name
      .split(/[_\s-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * 轉換為 snake_case
   */
  private toSnakeCase(name: string): string {
    return name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/__+/g, '_');
  }

  /**
   * 轉換為 UPPER_SNAKE_CASE
   */
  private toUpperSnakeCase(name: string): string {
    return this.toSnakeCase(name).toUpperCase();
  }
}
