# Analysis 模組開發規範

## 實作狀態 ✅

### 實際檔案結構
```
analysis/
├── index.ts                    ✅ 模組入口
├── complexity-analyzer.ts      ✅ 複雜度分析
├── dead-code-detector.ts       ✅ 死代碼檢測
├── duplication-detector.ts     ✅ 重複代碼檢測
├── quality-metrics.ts          ✅ 品質度量
├── types.ts (如需要)           ⏳ 型別定義
└── 其他進階功能              ⏳ 待實作
```

### 實作功能狀態
- ✅ 複雜度分析功能
- ✅ 死代碼檢測功能
- ✅ 重複代碼檢測功能
- ✅ 品質度量功能
- ⏳ 架構分析功能
- ⏳ 技術債務評估
- ⏳ 程式碼異味檢測

## 模組職責
提供深度程式碼分析功能，包括複雜度分析、品質評估、死代碼檢測、重複程式碼檢測和架構分析。

## 開發原則

### 1. 分析準確性
- **精確度量**：使用標準化的度量方法
- **多維度分析**：從不同角度評估程式碼
- **可驗證性**：分析結果可重現
- **誤報最小化**：減少錯誤警告

### 2. 實用性
- 提供可操作的建議
- 優先顯示重要問題
- 支援漸進式改進
- 整合開發流程

### 3. 效能考量
- 增量分析
- 結果快取
- 並行處理
- 資源限制

## 實作規範

### 檔案結構
```
analysis/
├── index.ts                 # 模組入口
├── service.ts               # AnalysisService 實作
├── complexity/
│   ├── cyclomatic.ts           # 循環複雜度
│   ├── cognitive.ts            # 認知複雜度
│   └── halstead.ts             # Halstead 複雜度
├── quality/
│   ├── maintainability.ts      # 可維護性指數
│   ├── tech-debt.ts            # 技術債務
│   └── code-smells.ts          # 程式碼異味
├── detection/
│   ├── dead-code.ts            # 死代碼檢測
│   ├── duplication.ts          # 重複檢測
│   └── unused.ts               # 未使用檢測
├── architecture/
│   ├── layer-analyzer.ts       # 層級分析
│   └── solid.ts                # SOLID 原則檢查
└── types.ts                 # 型別定義
```

## 複雜度分析

### 循環複雜度計算
```typescript
class CyclomaticComplexityAnalyzer {
  // McCabe 循環複雜度
  calculate(ast: ASTNode): number {
    let complexity = 1; // 基礎路徑

    this.traverse(ast, {
      // 條件語句 +1
      IfStatement: () => complexity++,
      ConditionalExpression: () => complexity++,

      // 循環 +1
      ForStatement: () => complexity++,
      WhileStatement: () => complexity++,
      DoWhileStatement: () => complexity++,

      // Switch case +1 (不含 default)
      SwitchCase: (node) => {
        if (!node.default) complexity++;
      },

      // 邏輯運算 +1
      LogicalExpression: (node) => {
        if (node.operator === '&&' || node.operator === '||') {
          complexity++;
        }
      },

      // 異常處理 +1
      CatchClause: () => complexity++
    });

    return complexity;
  }

  // 評估複雜度等級
  evaluate(complexity: number): ComplexityLevel {
    if (complexity <= 5) return 'simple';
    if (complexity <= 10) return 'moderate';
    if (complexity <= 20) return 'complex';
    return 'very-complex';
  }
}
```

### 認知複雜度
```typescript
class CognitiveComplexityAnalyzer {
  private nestingLevel = 0;

  // Cognitive Complexity (SonarSource)
  calculate(ast: ASTNode): number {
    let complexity = 0;

    this.traverse(ast, {
      // 結構增量
      IfStatement: (node) => {
        complexity += 1 + this.nestingLevel;
        this.nestingLevel++;
        this.visitChildren(node);
        this.nestingLevel--;
      },

      // 循環增量
      ForStatement: (node) => {
        complexity += 1 + this.nestingLevel;
        this.nestingLevel++;
        this.visitChildren(node);
        this.nestingLevel--;
      },

      // 遞迴呼叫
      CallExpression: (node) => {
        if (this.isRecursive(node)) {
          complexity += 1;
        }
      },

      // 巢狀函式
      FunctionExpression: () => {
        this.nestingLevel++;
      }
    });

    return complexity;
  }
}
```

## 程式碼品質評估

### 可維護性指數
```typescript
class MaintainabilityIndex {
  // Microsoft Visual Studio 公式
  calculate(metrics: CodeMetrics): number {
    const { halsteadVolume, cyclomaticComplexity, linesOfCode } = metrics;

    // MI = 171 - 5.2 * ln(V) - 0.23 * CC - 16.2 * ln(LOC)
    const mi = Math.max(0,
      171 -
      5.2 * Math.log(halsteadVolume) -
      0.23 * cyclomaticComplexity -
      16.2 * Math.log(linesOfCode)
    );

    // 正規化到 0-100
    return Math.min(100, mi * 100 / 171);
  }

  // 評估等級
  evaluate(index: number): MaintainabilityLevel {
    if (index >= 80) return 'high';
    if (index >= 60) return 'moderate';
    if (index >= 40) return 'low';
    return 'very-low';
  }
}
```

### 程式碼異味檢測
```typescript
class CodeSmellDetector {
  private smells: CodeSmell[] = [];

  detect(ast: ASTNode): CodeSmell[] {
    this.smells = [];

    // 長函式
    this.detectLongMethod(ast);

    // 大類別
    this.detectLargeClass(ast);

    // 長參數列表
    this.detectLongParameterList(ast);

    // 重複程式碼
    this.detectDuplicateCode(ast);

    // 死代碼
    this.detectDeadCode(ast);

    // 過度耦合
    this.detectFeatureEnvy(ast);

    return this.smells;
  }

  private detectLongMethod(ast: ASTNode): void {
    this.traverse(ast, {
      FunctionDeclaration: (node) => {
        const lines = this.countLines(node);
        if (lines > 50) {
          this.smells.push({
            type: 'long-method',
            location: node.loc,
            severity: this.calculateSeverity(lines, 50, 100),
            message: `Function has ${lines} lines (threshold: 50)`,
            suggestion: 'Consider breaking down into smaller functions'
          });
        }
      }
    });
  }
}
```

## 死代碼檢測

### 未使用程式碼分析
```typescript
class DeadCodeDetector {
  private symbolTable: SymbolTable;
  private callGraph: CallGraph;

  // 檢測未使用的程式碼
  detectUnused(): UnusedCode[] {
    const unused: UnusedCode[] = [];

    // 1. 未使用的變數
    unused.push(...this.findUnusedVariables());

    // 2. 未使用的函式
    unused.push(...this.findUnusedFunctions());

    // 3. 未使用的類別
    unused.push(...this.findUnusedClasses());

    // 4. 未使用的 import
    unused.push(...this.findUnusedImports());

    // 5. 不可達程式碼
    unused.push(...this.findUnreachableCode());

    return unused;
  }

  private findUnusedVariables(): UnusedVariable[] {
    const unused: UnusedVariable[] = [];

    for (const [name, symbol] of this.symbolTable) {
      if (symbol.type === 'variable' && symbol.references.length === 0) {
        // 排除特殊情況
        if (this.isExported(symbol) || this.isParameter(symbol)) {
          continue;
        }

        unused.push({
          type: 'variable',
          name,
          location: symbol.location,
          confidence: this.calculateConfidence(symbol)
        });
      }
    }

    return unused;
  }

  // 不可達程式碼檢測
  private findUnreachableCode(): UnreachableCode[] {
    const unreachable: UnreachableCode[] = [];

    this.traverse(ast, {
      BlockStatement: (node) => {
        let reachable = true;

        for (const statement of node.body) {
          if (!reachable) {
            unreachable.push({
              type: 'unreachable',
              location: statement.loc,
              reason: 'Code after return/throw/break'
            });
          }

          if (this.isTerminator(statement)) {
            reachable = false;
          }
        }
      }
    });

    return unreachable;
  }
}
```

## 重複程式碼檢測

### 克隆檢測演算法
```typescript
class DuplicationDetector {
  private hashTable: Map<string, CodeFragment[]>;

  // Type-1: 完全相同
  // Type-2: 參數化相同
  // Type-3: 近似相同
  detectClones(ast: ASTNode): Clone[] {
    const clones: Clone[] = [];

    // 1. 收集所有程式碼片段
    const fragments = this.collectFragments(ast);

    // 2. 計算片段指紋
    for (const fragment of fragments) {
      const hash = this.computeHash(fragment);

      if (!this.hashTable.has(hash)) {
        this.hashTable.set(hash, []);
      }

      this.hashTable.get(hash)!.push(fragment);
    }

    // 3. 找出克隆組
    for (const [hash, group] of this.hashTable) {
      if (group.length > 1) {
        clones.push({
          type: this.classifyCloneType(group),
          instances: group,
          lines: this.countLines(group[0]),
          similarity: this.calculateSimilarity(group)
        });
      }
    }

    return clones;
  }

  // 使用 AST 指紋
  private computeHash(fragment: CodeFragment): string {
    // 正規化 AST（忽略變數名、常數值）
    const normalized = this.normalize(fragment.ast);

    // 計算結構化 hash
    return this.structuralHash(normalized);
  }

  // 相似度計算（編輯距離）
  private calculateSimilarity(fragments: CodeFragment[]): number {
    const base = fragments[0];
    let totalSimilarity = 0;

    for (let i = 1; i < fragments.length; i++) {
      const distance = this.levenshteinDistance(
        base.tokens,
        fragments[i].tokens
      );

      const maxLen = Math.max(base.tokens.length, fragments[i].tokens.length);
      totalSimilarity += 1 - (distance / maxLen);
    }

    return totalSimilarity / (fragments.length - 1);
  }
}
```

## 架構分析

### SOLID 原則檢查
```typescript
class SOLIDAnalyzer {
  // 單一職責原則
  checkSingleResponsibility(classNode: ClassNode): Violation[] {
    const violations: Violation[] = [];

    // 計算類別的職責數
    const responsibilities = this.identifyResponsibilities(classNode);

    if (responsibilities.length > 1) {
      violations.push({
        principle: 'SRP',
        message: `Class has ${responsibilities.length} responsibilities`,
        suggestions: responsibilities.map(r =>
          `Extract ${r} to separate class`
        )
      });
    }

    return violations;
  }

  // 開放封閉原則
  checkOpenClosed(ast: AST): Violation[] {
    const violations: Violation[] = [];

    // 檢查 switch/if-else 鏈
    this.traverse(ast, {
      SwitchStatement: (node) => {
        if (this.isTypeSwitch(node)) {
          violations.push({
            principle: 'OCP',
            message: 'Type checking switch statement',
            suggestion: 'Use polymorphism instead'
          });
        }
      }
    });

    return violations;
  }

  // 依賴反轉原則
  checkDependencyInversion(imports: Import[]): Violation[] {
    const violations: Violation[] = [];

    for (const imp of imports) {
      if (this.isConcreteImplementation(imp)) {
        violations.push({
          principle: 'DIP',
          message: `Direct dependency on concrete class: ${imp.source}`,
          suggestion: 'Depend on abstraction instead'
        });
      }
    }

    return violations;
  }
}
```

## 報告生成

### 分析報告格式
```typescript
class AnalysisReporter {
  // 生成綜合報告
  generateReport(analysis: AnalysisResult): Report {
    return {
      summary: this.generateSummary(analysis),
      metrics: this.aggregateMetrics(analysis),
      issues: this.prioritizeIssues(analysis),
      trends: this.calculateTrends(analysis),
      recommendations: this.generateRecommendations(analysis)
    };
  }

  // HTML 儀表板
  generateDashboard(analysis: AnalysisResult): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Code Analysis Dashboard</title>
          ${this.generateStyles()}
        </head>
        <body>
          ${this.generateHeader(analysis)}
          ${this.generateMetricsSection(analysis)}
          ${this.generateIssuesSection(analysis)}
          ${this.generateChartsSection(analysis)}
        </body>
      </html>
    `;
  }
}
```

## 開發檢查清單

### 分析完整性
- [x] 所有複雜度指標
- [x] 品質評估完整
- [x] 死代碼檢測準確
- [x] 重複檢測敏感度
- [ ] 架構規則完備

### 效能要求
- [ ] 大檔案分析 < 1s
- [ ] 專案分析 < 30s
- [ ] 增量分析支援
- [ ] 記憶體使用合理