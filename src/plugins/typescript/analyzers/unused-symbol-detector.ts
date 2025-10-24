/**
 * TypeScript 未使用符號檢測器
 * 檢測未使用的變數、函式、類別
 */

import type { Symbol, AST } from '../../../shared/types/index.js';
import { SymbolType, ReferenceType } from '../../../shared/types/index.js';
import type { UnusedCode } from '../../../infrastructure/parser/analysis-types.js';
import type { TypeScriptAST } from '../types.js';

/**
 * 未使用符號檢測器
 */
export class UnusedSymbolDetector {
  /**
   * 檢測未使用的符號
   * @param ast TypeScript AST 物件
   * @param allSymbols 所有符號列表
   * @param findReferences 查找引用的函式（從 parser 傳入）
   * @returns 未使用的符號列表
   */
  async detect(
    ast: TypeScriptAST,
    allSymbols: Symbol[],
    findReferences: (ast: AST, symbol: Symbol) => Promise<any[]>
  ): Promise<UnusedCode[]> {
    const unused: UnusedCode[] = [];

    // 優化：提早過濾，只對需要檢測的符號建立 reference map
    const symbolsToCheck = allSymbols.filter(symbol => {
      // 跳過已匯出的符號
      if (this.isExported(symbol)) {
        return false;
      }

      // 跳過函式參數
      if (this.isParameter(symbol)) {
        return false;
      }

      // 跳過 public/protected 類別成員
      if (this.isPublicOrProtectedMember(symbol)) {
        return false;
      }

      return true;
    });

    // 只對需要檢測的符號建立 reference map
    const referenceMap = await this.buildReferenceMap(ast, symbolsToCheck, findReferences);

    for (const symbol of symbolsToCheck) {
      // 從映射表中查找引用（O(1)）
      const references = referenceMap.get(symbol.name) || [];

      // 過濾出實際使用（非定義）的引用
      const usageReferences = references.filter(ref =>
        ref.type === ReferenceType.Usage
      );

      if (usageReferences.length === 0) {
        unused.push({
          type: this.mapSymbolType(symbol.type),
          name: symbol.name,
          location: {
            filePath: symbol.location.filePath,
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          confidence: this.calculateConfidence(references),
          reason: `${this.mapSymbolType(symbol.type)} '${symbol.name}' 已宣告但從未使用`
        });
      }
    }

    return unused;
  }

  /**
   * 建立引用映射表（批次處理）
   * 優化：使用 Promise.all 並行處理多個符號
   */
  private async buildReferenceMap(
    ast: TypeScriptAST,
    symbols: Symbol[],
    findReferences: (ast: AST, symbol: Symbol) => Promise<any[]>
  ): Promise<Map<string, any[]>> {
    const referenceMap = new Map<string, any[]>();

    // 如果符號數量很少，直接處理
    if (symbols.length === 0) {
      return referenceMap;
    }

    // 增加批次大小以提升效能
    const batchSize = 50;

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);

      // 批次並行處理
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const references = await findReferences(ast, symbol);
            referenceMap.set(symbol.name, references);
          } catch (error) {
            // 查找失敗時記錄空引用
            referenceMap.set(symbol.name, []);
          }
        })
      );
    }

    return referenceMap;
  }

  /**
   * 檢查符號是否已匯出
   */
  private isExported(symbol: Symbol): boolean {
    return symbol.modifiers?.includes('export') || false;
  }

  /**
   * 檢查是否為函式參數
   */
  private isParameter(symbol: Symbol): boolean {
    // 檢查 scope，如果 parent 是 function 且符號在參數位置，就是參數
    if (symbol.scope?.type === 'function') {
      // 簡化判斷：如果符號類型是 Variable 且在 function scope 內，可能是參數或局部變數
      // 更準確的判斷需要檢查 AST 節點類型
      return false; // 暫時保守處理，不跳過任何符號
    }
    return false;
  }

  /**
   * 檢查是否為 public 或 protected 類別成員
   * 這些成員可能被子類別或外部程式碼使用，單檔案模式無法檢測
   */
  private isPublicOrProtectedMember(symbol: Symbol): boolean {
    const modifiers = symbol.modifiers || [];

    // 如果有 public 或 protected 修飾符
    if (modifiers.includes('public') || modifiers.includes('protected')) {
      return true;
    }

    // 檢查 scope：如果是類別成員（scope.parent.type === 'class'），且沒有 private 修飾符，預設就是 public
    if (symbol.scope?.parent?.type === 'class' && !modifiers.includes('private')) {
      return true;
    }

    return false;
  }

  /**
   * 映射符號類型到 UnusedCode 類型
   */
  private mapSymbolType(symbolType: SymbolType): 'variable' | 'function' | 'class' | 'import' {
    switch (symbolType) {
    case SymbolType.Function:
      return 'function';
    case SymbolType.Class:
      return 'class';
    case SymbolType.Variable:
    case SymbolType.Constant:
      return 'variable';
    default:
      return 'variable';
    }
  }

  /**
   * 計算檢測置信度
   */
  private calculateConfidence(references: any[]): number {
    // 如果完全沒有引用（連定義都不算），置信度最高
    if (references.length === 0) {
      return 1.0;
    }

    // 如果只有定義引用，沒有使用引用
    const usageRefs = references.filter((ref: any) => ref.type === ReferenceType.Usage);
    if (usageRefs.length === 0) {
      return 0.95;
    }

    return 0.9;
  }
}
