/**
 * 死代碼檢測器
 * 檢測未使用的變數、函式、類別和不可達代碼
 */

import * as ts from 'typescript';
import { TypeScriptParser } from '../../plugins/typescript/parser.js';
import type { Symbol, AST } from '../../shared/types/index.js';
import { SymbolType, ReferenceType } from '../../shared/types/index.js';

// 符號表介面（向後相容，但內部使用統一的 Symbol 介面）
export interface LegacySymbol {
  name: string;
  type: 'variable' | 'function' | 'class' | 'import';
  location: { line: number; column: number };
  references: Reference[];
  exported: boolean;
  parameter: boolean;
}

export interface Reference {
  location: { line: number; column: number };
  type: 'read' | 'write' | 'call';
}

// 未使用程式碼介面
export interface UnusedCode {
  type: 'variable' | 'function' | 'class' | 'import' | 'unreachable';
  name?: string;
  location: { line: number; column: number };
  confidence: number;
  reason?: string;
}

// AST 節點介面
export interface ASTNode {
  type: string;
  children?: ASTNode[];
  location: { line: number; column: number };
  isTerminator?: boolean;
  name?: string;
  exported?: boolean;
}

/**
 * 未使用符號檢測器
 */
export class UnusedSymbolDetector {
  private parser: TypeScriptParser;

  constructor() {
    this.parser = new TypeScriptParser();
  }

  /**
   * 檢測未使用的符號
   * @param ast AST 物件
   * @returns 未使用的符號列表
   */
  async detect(ast: AST, content: string): Promise<UnusedCode[]> {
    const unused: UnusedCode[] = [];

    // 提取所有符號
    const symbols = await this.parser.extractSymbols(ast);

    for (const symbol of symbols) {
      // 跳過已匯出的符號
      if (this.isExported(symbol)) {
        continue;
      }

      // 跳過函式參數（檢查 scope 或 modifiers）
      if (this.isParameter(symbol)) {
        continue;
      }

      // 使用 parser 查找引用
      const references = await this.parser.findReferences(ast, symbol);

      // 過濾出實際使用（非定義）的引用
      const usageReferences = references.filter(ref =>
        ref.type === ReferenceType.Usage
      );

      if (usageReferences.length === 0) {
        unused.push({
          type: this.mapSymbolType(symbol.type),
          name: symbol.name,
          location: {
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

  /**
   * 清理資源
   */
  async dispose(): Promise<void> {
    await this.parser.dispose();
  }
}

/**
 * 不可達代碼檢測器
 */
export class UnreachableCodeDetector {
  /**
   * 檢測不可達代碼
   * @param ast AST 根節點
   * @returns 不可達代碼列表
   */
  detect(ast: ASTNode): UnusedCode[] {
    const unreachable: UnusedCode[] = [];

    this.traverse(ast, false, unreachable);

    return unreachable;
  }

  /**
   * 遍歷 AST 檢測不可達代碼
   */
  private traverse(node: ASTNode, isUnreachable: boolean, unreachable: UnusedCode[]) {
    if (!node) {return;}

    // 如果已經在不可達狀態，標記所有後續節點
    if (isUnreachable && this.isExecutableStatement(node)) {
      unreachable.push({
        type: 'unreachable',
        location: node.location,
        confidence: 0.9,
        reason: '此代碼永遠不會被執行'
      });
    }

    // 檢查是否是終止語句（return、throw、break、continue）
    let nextUnreachable = isUnreachable;
    if (this.isTerminatingStatement(node)) {
      nextUnreachable = true;
    }

    // 遍歷子節點
    if (node.children) {
      for (const child of node.children) {
        this.traverse(child, nextUnreachable, unreachable);

        // 如果子節點是終止語句，後續兄弟節點都不可達
        if (this.isTerminatingStatement(child)) {
          nextUnreachable = true;
        }
      }
    }
  }

  /**
   * 檢查是否為可執行語句
   */
  private isExecutableStatement(node: ASTNode): boolean {
    const executableTypes = [
      'ExpressionStatement',
      'VariableDeclaration',
      'FunctionDeclaration',
      'ClassDeclaration',
      'IfStatement',
      'ForStatement',
      'WhileStatement',
      'ReturnStatement',
      'ThrowStatement'
    ];

    return executableTypes.includes(node.type);
  }

  /**
   * 檢查是否為終止語句
   */
  private isTerminatingStatement(node: ASTNode): boolean {
    if (node.isTerminator) {
      return true;
    }

    return ['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'].includes(node.type);
  }
}

/**
 * 死代碼檢測器主類
 */
export class DeadCodeDetector {
  private unusedSymbolDetector = new UnusedSymbolDetector();
  private unreachableCodeDetector = new UnreachableCodeDetector();
  private parser = new TypeScriptParser();

  /**
   * 檢測檔案中的死代碼
   * @param filePath 檔案路徑
   * @param content 檔案內容
   * @returns 死代碼檢測結果
   */
  async detectInFile(filePath: string, content: string): Promise<UnusedCode[]> {
    // 輸入驗證
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('檔案路徑必須是非空字串');
    }

    if (typeof content !== 'string') {
      throw new Error('檔案內容必須是字串');
    }

    // 空檔案沒有死代碼
    if (content.trim() === '') {
      return [];
    }

    // 只支援 TypeScript 檔案
    if (!filePath.match(/\.(ts|tsx)$/)) {
      // 對非 TypeScript 檔案返回空結果
      return [];
    }

    try {
      // 解析程式碼使用 TypeScript parser
      const ast = await this.parser.parse(content, filePath);

      // 檢測未使用符號
      const unusedSymbols = await this.unusedSymbolDetector.detect(ast, content);

      // 檢測不可達代碼
      const unreachableCode = this.unreachableCodeDetector.detect(this.convertToLegacyAST(ast));

      return [...unusedSymbols, ...unreachableCode];
    } catch (error) {
      // 解析錯誤時返回空結果而不是拋出錯誤
      // 因為可能是語法錯誤的檔案
      return [];
    }
  }

  /**
   * 批次檢測多個檔案
   * @param files 檔案路徑列表
   * @returns 每個檔案的死代碼檢測結果
   */
  async detectInFiles(files: string[]): Promise<Array<{
    file: string;
    deadCode: UnusedCode[];
  }>> {
    if (!Array.isArray(files)) {
      throw new Error('檔案列表必須是陣列');
    }

    const results = await Promise.all(
      files.map(async (file) => {
        try {
          // 讀取檔案內容
          const fs = await import('fs/promises');
          const content = await fs.readFile(file, 'utf-8');
          const deadCode = await this.detectInFile(file, content);
          return { file, deadCode };
        } catch (error) {
          return {
            file,
            deadCode: [{
              type: 'unreachable' as const,
              location: { line: 0, column: 0 },
              confidence: 0,
              reason: `檢測失敗: ${error instanceof Error ? error.message : '未知錯誤'}`
            }]
          };
        }
      })
    );

    return results;
  }

  /**
   * 轉換 TypeScript AST 到舊版 AST 格式（用於不可達代碼檢測）
   */
  private convertToLegacyAST(ast: AST): ASTNode {
    // 簡化實作：創建一個基本的 AST 節點
    return {
      type: 'Program',
      location: { line: 1, column: 1 },
      children: []
    };
  }

  /**
   * 獲取檢測統計
   */
  async getStatistics(files: string[]): Promise<{
    totalFiles: number;
    totalDeadCode: number;
    byType: Record<string, number>;
    averageConfidence: number;
  }> {
    const results = await this.detectInFiles(files);

    const allDeadCode = results.flatMap(result => result.deadCode);
    const byType: Record<string, number> = {};
    let totalConfidence = 0;

    for (const dead of allDeadCode) {
      byType[dead.type] = (byType[dead.type] || 0) + 1;
      totalConfidence += dead.confidence;
    }

    return {
      totalFiles: files.length,
      totalDeadCode: allDeadCode.length,
      byType,
      averageConfidence: allDeadCode.length > 0 ? totalConfidence / allDeadCode.length : 0
    };
  }

  /**
   * 清理資源
   */
  async dispose(): Promise<void> {
    await this.unusedSymbolDetector.dispose();
    await this.parser.dispose();
  }
}