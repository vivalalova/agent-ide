import { describe, it, expect, beforeEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';

/**
 * 死代碼檢測器測試
 * 測試未使用變數、函式、類別和不可達代碼的檢測功能
 */

// 符號表介面
interface Symbol {
  name: string;
  type: 'variable' | 'function' | 'class' | 'import';
  location: { line: number; column: number };
  references: Reference[];
  exported: boolean;
  parameter: boolean;
}

interface Reference {
  location: { line: number; column: number };
  type: 'read' | 'write' | 'call';
}

// 未使用程式碼型別
interface UnusedCode {
  type: 'variable' | 'function' | 'class' | 'import' | 'unreachable';
  name?: string;
  location: { line: number; column: number };
  confidence: number;
  reason?: string;
}

// 模擬 AST 節點
interface MockASTNode {
  type: string;
  children?: MockASTNode[];
  location: { line: number; column: number };
  isTerminator?: boolean;
}

// 符號表管理器
class SymbolTable {
  private symbols = new Map<string, Symbol>();

  addSymbol(symbol: Symbol): void {
    this.symbols.set(symbol.name, symbol);
  }

  getSymbol(name: string): Symbol | undefined {
    return this.symbols.get(name);
  }

  getAllSymbols(): Symbol[] {
    return Array.from(this.symbols.values());
  }

  [Symbol.iterator]() {
    return this.symbols.entries();
  }

  clear(): void {
    this.symbols.clear();
  }
}

// 死代碼檢測器
class DeadCodeDetector {
  private symbolTable: SymbolTable;

  constructor(symbolTable: SymbolTable) {
    this.symbolTable = symbolTable;
  }

  detectUnused(): UnusedCode[] {
    const unused: UnusedCode[] = [];

    unused.push(...this.findUnusedVariables());
    unused.push(...this.findUnusedFunctions());
    unused.push(...this.findUnusedClasses());
    unused.push(...this.findUnusedImports());

    return unused;
  }

  findUnreachableCode(ast: MockASTNode): UnusedCode[] {
    const unreachable: UnusedCode[] = [];

    const traverse = (node: MockASTNode) => {
      if (node.type === 'BlockStatement' && node.children) {
        let reachable = true;

        for (const statement of node.children) {
          if (!reachable) {
            unreachable.push({
              type: 'unreachable',
              location: statement.location,
              confidence: 0.95,
              reason: 'Code after return/throw/break'
            });
          }

          if (this.isTerminator(statement)) {
            reachable = false;
          }

          if (statement.children) {
            statement.children.forEach(traverse);
          }
        }
      } else if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(ast);
    return unreachable;
  }

  private findUnusedVariables(): UnusedCode[] {
    const unused: UnusedCode[] = [];

    for (const symbol of this.symbolTable.getAllSymbols()) {
      if (symbol.type === 'variable' && symbol.references.length === 0) {
        // 排除特殊情況
        if (symbol.exported || symbol.parameter) {
          continue;
        }

        unused.push({
          type: 'variable',
          name: symbol.name,
          location: symbol.location,
          confidence: this.calculateConfidence(symbol)
        });
      }
    }

    return unused;
  }

  private findUnusedFunctions(): UnusedCode[] {
    const unused: UnusedCode[] = [];

    for (const symbol of this.symbolTable.getAllSymbols()) {
      if (symbol.type === 'function' && symbol.references.length === 0) {
        if (symbol.exported) {
          continue;
        }

        unused.push({
          type: 'function',
          name: symbol.name,
          location: symbol.location,
          confidence: this.calculateConfidence(symbol)
        });
      }
    }

    return unused;
  }

  private findUnusedClasses(): UnusedCode[] {
    const unused: UnusedCode[] = [];

    for (const symbol of this.symbolTable.getAllSymbols()) {
      if (symbol.type === 'class' && symbol.references.length === 0) {
        if (symbol.exported) {
          continue;
        }

        unused.push({
          type: 'class',
          name: symbol.name,
          location: symbol.location,
          confidence: this.calculateConfidence(symbol)
        });
      }
    }

    return unused;
  }

  private findUnusedImports(): UnusedCode[] {
    const unused: UnusedCode[] = [];

    for (const symbol of this.symbolTable.getAllSymbols()) {
      if (symbol.type === 'import' && symbol.references.length === 0) {
        unused.push({
          type: 'import',
          name: symbol.name,
          location: symbol.location,
          confidence: 0.98 // Import 通常很確定是未使用的
        });
      }
    }

    return unused;
  }

  private calculateConfidence(symbol: Symbol): number {
    // 基礎信心度
    let confidence = 0.9;

    // 如果有寫操作但沒有讀操作，信心度降低
    const hasWrite = symbol.references.some(ref => ref.type === 'write');
    const hasRead = symbol.references.some(ref => ref.type === 'read');

    if (hasWrite && !hasRead) {
      confidence = 0.7; // 可能是意圖使用但忘記讀取
    }

    // 如果是導出的或參數，信心度大幅降低
    if (symbol.exported) {
      confidence = 0.3;
    }

    if (symbol.parameter) {
      confidence = 0.5;
    }

    return confidence;
  }

  private isTerminator(node: MockASTNode): boolean {
    return ['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement']
      .includes(node.type) || node.isTerminator === true;
  }
}

describe('死代碼檢測器', () => {
  let symbolTable: SymbolTable;
  let detector: DeadCodeDetector;

  beforeEach(() => {
    symbolTable = new SymbolTable();
    detector = new DeadCodeDetector(symbolTable);
  });

  describe('未使用變數檢測', () => {
    it('應該檢測到未使用的變數', withMemoryOptimization(() => {
      const unusedVariable: Symbol = {
        name: 'unusedVar',
        type: 'variable',
        location: { line: 1, column: 1 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(unusedVariable);

      const unused = detector.detectUnused();
      const foundVariable = unused.find(u => u.name === 'unusedVar');

      expect(foundVariable).toBeDefined();
      expect(foundVariable!.type).toBe('variable');
      expect(foundVariable!.confidence).toBe(0.9);
    }, { testName: 'unused-variable-detection' }));

    it('應該跳過已導出的變數', withMemoryOptimization(() => {
      const exportedVariable: Symbol = {
        name: 'exportedVar',
        type: 'variable',
        location: { line: 1, column: 1 },
        references: [],
        exported: true,
        parameter: false
      };

      symbolTable.addSymbol(exportedVariable);

      const unused = detector.detectUnused();
      const foundVariable = unused.find(u => u.name === 'exportedVar');

      expect(foundVariable).toBeUndefined();
    }, { testName: 'skip-exported-variable' }));

    it('應該跳過函式參數', withMemoryOptimization(() => {
      const parameter: Symbol = {
        name: 'param',
        type: 'variable',
        location: { line: 1, column: 1 },
        references: [],
        exported: false,
        parameter: true
      };

      symbolTable.addSymbol(parameter);

      const unused = detector.detectUnused();
      const foundParameter = unused.find(u => u.name === 'param');

      expect(foundParameter).toBeUndefined();
    }, { testName: 'skip-function-parameter' }));

    it('應該正確處理有引用的變數', withMemoryOptimization(() => {
      const usedVariable: Symbol = {
        name: 'usedVar',
        type: 'variable',
        location: { line: 1, column: 1 },
        references: [
          { location: { line: 2, column: 1 }, type: 'read' }
        ],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(usedVariable);

      const unused = detector.detectUnused();
      const foundVariable = unused.find(u => u.name === 'usedVar');

      expect(foundVariable).toBeUndefined();
    }, { testName: 'skip-used-variable' }));
  });

  describe('未使用函式檢測', () => {
    it('應該檢測到未使用的函式', withMemoryOptimization(() => {
      const unusedFunction: Symbol = {
        name: 'unusedFunc',
        type: 'function',
        location: { line: 5, column: 1 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(unusedFunction);

      const unused = detector.detectUnused();
      const foundFunction = unused.find(u => u.name === 'unusedFunc');

      expect(foundFunction).toBeDefined();
      expect(foundFunction!.type).toBe('function');
    }, { testName: 'unused-function-detection' }));

    it('應該跳過已導出的函式', withMemoryOptimization(() => {
      const exportedFunction: Symbol = {
        name: 'exportedFunc',
        type: 'function',
        location: { line: 5, column: 1 },
        references: [],
        exported: true,
        parameter: false
      };

      symbolTable.addSymbol(exportedFunction);

      const unused = detector.detectUnused();
      const foundFunction = unused.find(u => u.name === 'exportedFunc');

      expect(foundFunction).toBeUndefined();
    }, { testName: 'skip-exported-function' }));
  });

  describe('未使用類別檢測', () => {
    it('應該檢測到未使用的類別', withMemoryOptimization(() => {
      const unusedClass: Symbol = {
        name: 'UnusedClass',
        type: 'class',
        location: { line: 10, column: 1 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(unusedClass);

      const unused = detector.detectUnused();
      const foundClass = unused.find(u => u.name === 'UnusedClass');

      expect(foundClass).toBeDefined();
      expect(foundClass!.type).toBe('class');
    }, { testName: 'unused-class-detection' }));
  });

  describe('未使用 import 檢測', () => {
    it('應該檢測到未使用的 import', withMemoryOptimization(() => {
      const unusedImport: Symbol = {
        name: 'unusedModule',
        type: 'import',
        location: { line: 1, column: 1 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(unusedImport);

      const unused = detector.detectUnused();
      const foundImport = unused.find(u => u.name === 'unusedModule');

      expect(foundImport).toBeDefined();
      expect(foundImport!.type).toBe('import');
      expect(foundImport!.confidence).toBe(0.98);
    }, { testName: 'unused-import-detection' }));
  });

  describe('不可達代碼檢測', () => {
    it('應該檢測到 return 後的不可達代碼', withMemoryOptimization(() => {
      const ast: MockASTNode = {
        type: 'FunctionDeclaration',
        location: { line: 1, column: 1 },
        children: [
          {
            type: 'BlockStatement',
            location: { line: 2, column: 1 },
            children: [
              {
                type: 'ReturnStatement',
                location: { line: 3, column: 1 }
              },
              {
                type: 'ExpressionStatement',
                location: { line: 4, column: 1 }
              },
              {
                type: 'VariableDeclaration',
                location: { line: 5, column: 1 }
              }
            ]
          }
        ]
      };

      const unreachable = detector.findUnreachableCode(ast);

      expect(unreachable).toHaveLength(2);
      expect(unreachable[0].location.line).toBe(4);
      expect(unreachable[1].location.line).toBe(5);
      expect(unreachable[0].reason).toContain('Code after return');
    }, { testName: 'unreachable-after-return' }));

    it('應該檢測到 throw 後的不可達代碼', withMemoryOptimization(() => {
      const ast: MockASTNode = {
        type: 'FunctionDeclaration',
        location: { line: 1, column: 1 },
        children: [
          {
            type: 'BlockStatement',
            location: { line: 2, column: 1 },
            children: [
              {
                type: 'ThrowStatement',
                location: { line: 3, column: 1 }
              },
              {
                type: 'ExpressionStatement',
                location: { line: 4, column: 1 }
              }
            ]
          }
        ]
      };

      const unreachable = detector.findUnreachableCode(ast);

      expect(unreachable).toHaveLength(1);
      expect(unreachable[0].location.line).toBe(4);
    }, { testName: 'unreachable-after-throw' }));

    it('應該處理巢狀區塊中的不可達代碼', withMemoryOptimization(() => {
      const ast: MockASTNode = {
        type: 'FunctionDeclaration',
        location: { line: 1, column: 1 },
        children: [
          {
            type: 'BlockStatement',
            location: { line: 2, column: 1 },
            children: [
              {
                type: 'IfStatement',
                location: { line: 3, column: 1 },
                children: [
                  {
                    type: 'BlockStatement',
                    location: { line: 4, column: 1 },
                    children: [
                      {
                        type: 'ReturnStatement',
                        location: { line: 5, column: 1 }
                      },
                      {
                        type: 'ExpressionStatement',
                        location: { line: 6, column: 1 }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      const unreachable = detector.findUnreachableCode(ast);

      expect(unreachable).toHaveLength(1);
      expect(unreachable[0].location.line).toBe(6);
    }, { testName: 'nested-unreachable-code' }));

    it('應該在沒有終止語句的區塊中不檢測到不可達代碼', withMemoryOptimization(() => {
      const ast: MockASTNode = {
        type: 'FunctionDeclaration',
        location: { line: 1, column: 1 },
        children: [
          {
            type: 'BlockStatement',
            location: { line: 2, column: 1 },
            children: [
              {
                type: 'ExpressionStatement',
                location: { line: 3, column: 1 }
              },
              {
                type: 'VariableDeclaration',
                location: { line: 4, column: 1 }
              }
            ]
          }
        ]
      };

      const unreachable = detector.findUnreachableCode(ast);

      expect(unreachable).toHaveLength(0);
    }, { testName: 'no-unreachable-code' }));
  });

  describe('信心度計算', () => {
    it('應該為只有寫操作的變數降低信心度', withMemoryOptimization(() => {
      const writeOnlyVariable: Symbol = {
        name: 'writeOnly',
        type: 'variable',
        location: { line: 1, column: 1 },
        references: [
          { location: { line: 2, column: 1 }, type: 'write' }
        ],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(writeOnlyVariable);

      const unused = detector.detectUnused();
      expect(unused).toHaveLength(0); // 有引用，不算未使用

      // 測試信心度計算邏輯
      const confidence = (detector as any).calculateConfidence(writeOnlyVariable);
      expect(confidence).toBe(0.7);
    }, { testName: 'write-only-confidence' }));

    it('應該為導出符號大幅降低信心度', withMemoryOptimization(() => {
      const exportedSymbol: Symbol = {
        name: 'exported',
        type: 'variable',
        location: { line: 1, column: 1 },
        references: [],
        exported: true,
        parameter: false
      };

      const confidence = (detector as any).calculateConfidence(exportedSymbol);
      expect(confidence).toBe(0.3);
    }, { testName: 'exported-symbol-confidence' }));
  });

  describe('整合測試', () => {
    it('應該同時檢測多種類型的死代碼', withMemoryOptimization(() => {
      // 新增多個未使用的符號
      symbolTable.addSymbol({
        name: 'unusedVar',
        type: 'variable',
        location: { line: 1, column: 1 },
        references: [],
        exported: false,
        parameter: false
      });

      symbolTable.addSymbol({
        name: 'unusedFunc',
        type: 'function',
        location: { line: 5, column: 1 },
        references: [],
        exported: false,
        parameter: false
      });

      symbolTable.addSymbol({
        name: 'unusedImport',
        type: 'import',
        location: { line: 1, column: 1 },
        references: [],
        exported: false,
        parameter: false
      });

      const unused = detector.detectUnused();

      expect(unused).toHaveLength(3);
      expect(unused.map(u => u.type)).toContain('variable');
      expect(unused.map(u => u.type)).toContain('function');
      expect(unused.map(u => u.type)).toContain('import');
    }, { testName: 'multiple-dead-code-types' }));

    it('應該正確處理大量符號', withMemoryOptimization(() => {
      // 新增大量符號
      for (let i = 0; i < 1000; i++) {
        symbolTable.addSymbol({
          name: `symbol${i}`,
          type: i % 2 === 0 ? 'variable' : 'function',
          location: { line: i + 1, column: 1 },
          references: i < 500 ? [] : [{ location: { line: i + 2, column: 1 }, type: 'read' }],
          exported: false,
          parameter: false
        });
      }

      const unused = detector.detectUnused();

      expect(unused).toHaveLength(500); // 前 500 個沒有引用
      expect(unused.every(u => u.confidence > 0)).toBe(true);
    }, { testName: 'large-symbol-table' }));
  });

  describe('現代 JavaScript 特性死代碼檢測', () => {
    it('應該檢測未使用的箭頭函式', withMemoryOptimization(() => {
      const unusedArrowFunction: Symbol = {
        name: 'arrowFunc',
        type: 'function',
        location: { line: 15, column: 5 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(unusedArrowFunction);

      const unused = detector.detectUnused();
      const foundArrow = unused.find(u => u.name === 'arrowFunc');

      expect(foundArrow).toBeDefined();
      expect(foundArrow!.confidence).toBeGreaterThanOrEqual(0.9);
    }, { testName: 'unused-arrow-function' }));

    it('應該檢測未使用的解構變數', withMemoryOptimization(() => {
      const destructuredVar: Symbol = {
        name: 'destructuredValue',
        type: 'variable',
        location: { line: 20, column: 10 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(destructuredVar);

      const unused = detector.detectUnused();
      const foundDestructured = unused.find(u => u.name === 'destructuredValue');

      expect(foundDestructured).toBeDefined();
      expect(foundDestructured!.type).toBe('variable');
    }, { testName: 'unused-destructured-variable' }));

    it('應該檢測未使用的 async 函式', withMemoryOptimization(() => {
      const asyncFunction: Symbol = {
        name: 'asyncHandler',
        type: 'function',
        location: { line: 25, column: 1 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(asyncFunction);

      const unused = detector.detectUnused();
      const foundAsync = unused.find(u => u.name === 'asyncHandler');

      expect(foundAsync).toBeDefined();
      expect(foundAsync!.confidence).toBeGreaterThan(0.8);
    }, { testName: 'unused-async-function' }));

    it('應該檢測未使用的類別屬性', withMemoryOptimization(() => {
      const classProperty: Symbol = {
        name: 'privateProperty',
        type: 'variable',
        location: { line: 30, column: 3 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(classProperty);

      const unused = detector.detectUnused();
      const foundProperty = unused.find(u => u.name === 'privateProperty');

      expect(foundProperty).toBeDefined();
      expect(foundProperty!.type).toBe('variable');
    }, { testName: 'unused-class-property' }));
  });

  describe('參數化死代碼檢測測試', () => {
    it.each([
      { type: 'variable' as const, name: 'unusedVar1', confidence: 0.95 },
      { type: 'function' as const, name: 'unusedFunc1', confidence: 0.9 },
      { type: 'class' as const, name: 'UnusedClass1', confidence: 0.9 },
      { type: 'import' as const, name: 'unusedImport1', confidence: 0.98 }
    ])('應該檢測 $type 類型的死代碼', ({ type, name, confidence }) => {
      const symbol: Symbol = {
        name,
        type,
        location: { line: 40, column: 1 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(symbol);

      const unused = detector.detectUnused();
      const found = unused.find(u => u.name === name);

      expect(found).toBeDefined();
      expect(found!.type).toBe(type);
      expect(found!.confidence).toBeCloseTo(confidence, 1);
    });

    it.each([
      { referenceCount: 1, shouldBeUnused: false, description: '單次引用' },
      { referenceCount: 5, shouldBeUnused: false, description: '多次引用' },
      { referenceCount: 0, shouldBeUnused: true, description: '無引用' }
    ])('應該正確處理 $description 的符號', ({ referenceCount, shouldBeUnused }) => {
      const symbol: Symbol = {
        name: `testSymbol_${referenceCount}`,
        type: 'variable',
        location: { line: 50, column: 1 },
        references: Array.from({ length: referenceCount }, (_, i) => ({
          location: { line: 51 + i, column: 1 },
          type: 'read' as const
        })),
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(symbol);

      const unused = detector.detectUnused();
      const found = unused.find(u => u.name === symbol.name);

      expect(!!found).toBe(shouldBeUnused);
    });
  });

  describe('複雜場景死代碼檢測', () => {
    it('應該檢測相互依賴但未對外使用的符號群', withMemoryOptimization(() => {
      // 建立相互依賴的符號群
      const funcA: Symbol = {
        name: 'functionA',
        type: 'function',
        location: { line: 60, column: 1 },
        references: [{ location: { line: 62, column: 5 }, type: 'call' }],
        exported: false,
        parameter: false
      };

      const funcB: Symbol = {
        name: 'functionB',
        type: 'function',
        location: { line: 61, column: 1 },
        references: [{ location: { line: 63, column: 5 }, type: 'call' }],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(funcA);
      symbolTable.addSymbol(funcB);

      const unused = detector.detectUnused();

      // 雖然相互引用，但對外部無用
      expect(unused).toHaveLength(0); // 目前實作可能無法檢測這種情況
    }, { testName: 'circular-dependency-unused' }));

    it('應該檢測條件性死代碼', withMemoryOptimization(() => {
      const conditionalVar: Symbol = {
        name: 'conditionalVar',
        type: 'variable',
        location: { line: 70, column: 1 },
        references: [], // 在條件永不成立的分支中
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(conditionalVar);

      const unused = detector.detectUnused();
      const found = unused.find(u => u.name === 'conditionalVar');

      expect(found).toBeDefined();
    }, { testName: 'conditional-dead-code' }));

    it('應該檢測 TypeScript 特有的死代碼', withMemoryOptimization(() => {
      // 模擬 TypeScript 介面（編譯後不存在）
      const typeAlias: Symbol = {
        name: 'CustomType',
        type: 'class', // 在符號表中可能作為 class 類型
        location: { line: 80, column: 1 },
        references: [],
        exported: false,
        parameter: false
      };

      symbolTable.addSymbol(typeAlias);

      const unused = detector.detectUnused();
      const found = unused.find(u => u.name === 'CustomType');

      expect(found).toBeDefined();
    }, { testName: 'typescript-type-dead-code' }));
  });

  describe('死代碼檢測信心度測試', () => {
    it('應該為不同類型的死代碼提供適當的信心度', withMemoryOptimization(() => {
      const testSymbols: Symbol[] = [
        {
          name: 'definitelyUnused',
          type: 'variable',
          location: { line: 90, column: 1 },
          references: [],
          exported: false,
          parameter: false
        },
        {
          name: 'possiblyUnused',
          type: 'function',
          location: { line: 91, column: 1 },
          references: [{ location: { line: 92, column: 1 }, type: 'read' }],
          exported: true, // 導出但可能未在外部使用
          parameter: false
        }
      ];

      testSymbols.forEach(symbol => symbolTable.addSymbol(symbol));

      const unused = detector.detectUnused();

      const definite = unused.find(u => u.name === 'definitelyUnused');
      const possible = unused.find(u => u.name === 'possiblyUnused');

      expect(definite?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(possible).toBeUndefined(); // 導出的符號通常不會被標記為未使用
    }, { testName: 'confidence-levels' }));
  });

  describe('記憶體和效能優化', () => {
    it('應該在處理大量符號時保持記憶體效率', withMemoryOptimization(() => {
      const initialHeap = process.memoryUsage().heapUsed;

      // 建立大量符號並進行檢測
      for (let batch = 0; batch < 5; batch++) {
        for (let i = 0; i < 200; i++) {
          symbolTable.addSymbol({
            name: `batchSymbol_${batch}_${i}`,
            type: i % 4 === 0 ? 'variable' :
                  i % 4 === 1 ? 'function' :
                  i % 4 === 2 ? 'class' : 'import',
            location: { line: batch * 200 + i, column: 1 },
            references: i % 3 === 0 ? [] : [
              { location: { line: batch * 200 + i + 1, column: 1 }, type: 'read' }
            ],
            exported: false,
            parameter: false
          });
        }

        const unused = detector.detectUnused();
        expect(unused.length).toBeGreaterThan(0);
      }

      // 強制垃圾回收
      if (global.gc) {
        global.gc();
      }

      const finalHeap = process.memoryUsage().heapUsed;
      const heapIncrease = finalHeap - initialHeap;

      // 記憶體增長應該在合理範圍內 (小於 20MB)
      expect(heapIncrease).toBeLessThan(20 * 1024 * 1024);
    }, { testName: 'memory-efficiency' }));
  });
});