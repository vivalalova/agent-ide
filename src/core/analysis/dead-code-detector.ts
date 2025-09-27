/**
 * 死代碼檢測器
 * 檢測未使用的變數、函式、類別和不可達代碼
 */

// 符號表介面
export interface Symbol {
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
  /**
   * 檢測未使用的符號
   * @param symbols 符號表
   * @returns 未使用的符號列表
   */
  detect(symbols: Symbol[]): UnusedCode[] {
    const unused: UnusedCode[] = [];

    for (const symbol of symbols) {
      // 跳過已匯出的符號
      if (symbol.exported) {
        continue;
      }

      // 跳過函式參數
      if (symbol.parameter) {
        continue;
      }

      // 檢查引用次數
      const readReferences = symbol.references.filter(ref => ref.type === 'read' || ref.type === 'call');

      if (readReferences.length === 0) {
        unused.push({
          type: symbol.type,
          name: symbol.name,
          location: symbol.location,
          confidence: this.calculateConfidence(symbol),
          reason: `${symbol.type} '${symbol.name}' 已宣告但從未使用`
        });
      }
    }

    return unused;
  }

  /**
   * 計算檢測置信度
   */
  private calculateConfidence(symbol: Symbol): number {
    let confidence = 0.9;

    // 如果有寫入引用但沒有讀取引用，置信度較高
    const writeRefs = symbol.references.filter(ref => ref.type === 'write');
    const readRefs = symbol.references.filter(ref => ref.type === 'read');

    if (writeRefs.length > 0 && readRefs.length === 0) {
      confidence = 0.95;
    }

    // 如果完全沒有引用，置信度最高
    if (symbol.references.length === 0) {
      confidence = 1.0;
    }

    return confidence;
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
    if (!node) return;

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

    try {
      // 解析程式碼
      const { ast, symbols } = this.parseCode(content);

      // 檢測未使用符號
      const unusedSymbols = this.unusedSymbolDetector.detect(symbols);

      // 檢測不可達代碼
      const unreachableCode = this.unreachableCodeDetector.detect(ast);

      return [...unusedSymbols, ...unreachableCode];
    } catch (error) {
      throw new Error(`死代碼檢測失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
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
          // 實際實作中應該讀取檔案內容
          const content = ''; // 簡化實作
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
   * 簡化的程式碼解析
   * 實際實作中應該使用完整的 TypeScript 或 JavaScript parser
   */
  private parseCode(content: string): { ast: ASTNode; symbols: Symbol[] } {
    // 簡化實作：建立模擬的 AST 和符號表
    const ast: ASTNode = {
      type: 'Program',
      location: { line: 1, column: 1 },
      children: []
    };

    const symbols: Symbol[] = [];

    // 簡單的變數檢測
    const variableMatches = content.matchAll(/(?:const|let|var)\s+(\w+)/g);
    for (const match of variableMatches) {
      const name = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      symbols.push({
        name,
        type: 'variable',
        location: { line, column: match.index || 0 },
        references: this.findReferences(content, name),
        exported: content.includes(`export { ${name} }`) || content.includes(`export const ${name}`),
        parameter: false
      });
    }

    // 簡單的函式檢測
    const functionMatches = content.matchAll(/function\s+(\w+)/g);
    for (const match of functionMatches) {
      const name = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      symbols.push({
        name,
        type: 'function',
        location: { line, column: match.index || 0 },
        references: this.findReferences(content, name),
        exported: content.includes(`export function ${name}`) || content.includes(`export { ${name} }`),
        parameter: false
      });
    }

    return { ast, symbols };
  }

  /**
   * 查找符號引用
   */
  private findReferences(content: string, symbolName: string): Reference[] {
    const references: Reference[] = [];
    const regex = new RegExp(`\\b${symbolName}\\b`, 'g');

    let match;
    while ((match = regex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;

      references.push({
        location: { line, column: match.index },
        type: 'read' // 簡化實作，實際應該區分 read/write/call
      });
    }

    return references;
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
}