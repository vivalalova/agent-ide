/**
 * Python 未使用符號檢測器
 * 檢測未使用的變數、函式、類別和導入
 */

import type { Symbol } from '@shared/types/index.js';
import { SymbolType } from '@shared/types/index.js';
import type { UnusedCode } from '@infrastructure/parser/analysis-types.js';
import { type PythonAST, PythonNodeKind } from '../types.js';
import { traverseAST, getNodeText } from '../tree-sitter-bridge.js';

/**
 * Python 未使用符號檢測器類別
 */
export class PythonUnusedSymbolDetector {
  /**
   * 檢測未使用的符號
   */
  detect(ast: PythonAST, allSymbols: Symbol[]): UnusedCode[] {
    const unusedCodes: UnusedCode[] = [];

    // 收集所有使用的名稱
    const usedNames = this.collectUsedNames(ast);

    // 檢查每個符號是否被使用
    for (const symbol of allSymbols) {
      // 跳過特殊符號
      if (this.shouldSkipSymbol(symbol)) {
        continue;
      }

      // 檢查是否被使用
      const usageCount = usedNames.get(symbol.name) || 0;

      // 定義本身算一次使用，所以需要 > 1 才算有被引用
      if (usageCount <= 1) {
        unusedCodes.push({
          type: this.getUnusedType(symbol),
          name: symbol.name,
          location: {
            filePath: symbol.location.filePath,
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          confidence: this.calculateConfidence(symbol, usageCount),
          reason: this.generateReason(symbol)
        });
      }
    }

    return unusedCodes;
  }

  /**
   * 收集所有使用的名稱及其出現次數
   */
  private collectUsedNames(ast: PythonAST): Map<string, number> {
    const usedNames = new Map<string, number>();

    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Identifier) {
        const name = getNodeText(node);
        usedNames.set(name, (usedNames.get(name) || 0) + 1);
      }
    });

    return usedNames;
  }

  /**
   * 判斷是否應該跳過該符號
   */
  private shouldSkipSymbol(symbol: Symbol): boolean {
    const name = symbol.name;

    // 跳過特殊方法 (__init__, __str__ 等)
    if (name.startsWith('__') && name.endsWith('__')) {
      return true;
    }

    // 跳過私有成員（可能被外部使用）
    if (name.startsWith('_') && !name.startsWith('__')) {
      return true;
    }

    // 跳過 self 和 cls
    if (name === 'self' || name === 'cls') {
      return true;
    }

    // 跳過常見的魔術變數
    const magicNames = new Set(['__name__', '__main__', '__file__', '__all__']);
    if (magicNames.has(name)) {
      return true;
    }

    return false;
  }

  /**
   * 獲取未使用類型
   */
  private getUnusedType(symbol: Symbol): UnusedCode['type'] {
    switch (symbol.type) {
      case SymbolType.Function:
        return 'function';
      case SymbolType.Class:
        return 'class';
      case SymbolType.Module:
        return 'import';
      case SymbolType.Variable:
      case SymbolType.Constant:
      default:
        return 'variable';
    }
  }

  /**
   * 計算信心程度
   */
  private calculateConfidence(symbol: Symbol, usageCount: number): number {
    // 基礎信心
    let confidence = 0.8;

    // 如果完全沒有使用，信心更高
    if (usageCount === 0) {
      confidence = 0.95;
    }

    // 導入的符號可能在其他檔案使用，信心降低
    if (symbol.type === SymbolType.Module) {
      confidence *= 0.7;
    }

    // 公開的函式/類別可能被外部使用，信心降低
    if (
      (symbol.type === SymbolType.Function || symbol.type === SymbolType.Class)
      && !symbol.name.startsWith('_')
    ) {
      confidence *= 0.8;
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * 生成未使用原因說明
   */
  private generateReason(symbol: Symbol): string {
    const typeNames: Record<SymbolType, string> = {
      [SymbolType.Class]: '類別',
      [SymbolType.Function]: '函式',
      [SymbolType.Variable]: '變數',
      [SymbolType.Constant]: '常量',
      [SymbolType.Module]: '導入',
      [SymbolType.Interface]: '介面',
      [SymbolType.Protocol]: '協議',
      [SymbolType.Struct]: '結構',
      [SymbolType.Property]: '屬性',
      [SymbolType.Type]: '型別',
      [SymbolType.Enum]: '列舉',
      [SymbolType.Namespace]: '命名空間'
    };

    const typeName = typeNames[symbol.type] || '符號';
    return `${typeName} '${symbol.name}' 在此檔案中未被使用`;
  }
}
