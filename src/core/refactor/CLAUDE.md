# Refactor 模組開發規範

## 模組職責
提供自動化、安全、智能的程式碼重構功能，改善程式碼結構而不改變外部行為。

## 開發原則

### 1. 行為保持
- **語義不變**：重構後程式行為必須相同
- **測試驗證**：重構前後測試必須通過
- **類型安全**：保持類型系統完整性
- **介面穩定**：公開 API 保持不變

### 2. 安全性
- 預覽所有變更
- 支援完整回滾
- 漸進式重構
- 衝突檢測

### 3. 智能化
- 自動識別重構機會
- 提供重構建議
- 批次重構支援
- 模式識別

## 實作規範

### 檔案結構
```
refactor/
├── index.ts                 # 模組入口
├── service.ts               # RefactorService 實作
├── operations/
│   ├── extract/
│   │   ├── extract-function.ts    # 提取函式
│   │   ├── extract-variable.ts    # 提取變數
│   │   ├── extract-class.ts       # 提取類別
│   │   └── extract-interface.ts   # 提取介面
│   ├── inline/
│   │   ├── inline-function.ts     # 內聯函式
│   │   ├── inline-variable.ts     # 內聯變數
│   │   └── inline-class.ts        # 內聯類別
│   ├── move/
│   │   ├── move-method.ts         # 移動方法
│   │   ├── move-field.ts          # 移動欄位
│   │   └── pull-push-member.ts    # 拉升/下推成員
│   └── transform/
│       ├── change-signature.ts    # 改變簽名
│       ├── encapsulate-field.ts   # 封裝欄位
│       └── decompose-conditional.ts # 分解條件
├── patterns/
│   ├── design-patterns.ts    # 設計模式重構
│   ├── code-smells.ts        # 程式碼異味重構
│   └── performance.ts        # 效能重構
├── validators/
│   ├── precondition.ts       # 前置條件檢查
│   ├── semantic.ts           # 語義驗證
│   └── conflict.ts           # 衝突檢測
└── types.ts                  # 型別定義
```

## 提取重構實作

### 提取函式
```typescript
class ExtractFunctionRefactoring {
  // 提取函式的完整流程
  async execute(selection: CodeSelection): Promise<RefactorResult> {
    // 1. 分析選中的程式碼
    const analysis = await this.analyze(selection);
    
    // 2. 確定參數和返回值
    const signature = this.determineSignature(analysis);
    
    // 3. 生成新函式
    const newFunction = this.generateFunction(
      analysis.code,
      signature
    );
    
    // 4. 替換原始程式碼
    const replacement = this.generateCall(signature);
    
    // 5. 處理變數作用域
    const scopeAdjustments = this.adjustScopes(analysis);
    
    return {
      edits: [
        { type: 'insert', position: this.findInsertPosition(), content: newFunction },
        { type: 'replace', range: selection.range, content: replacement },
        ...scopeAdjustments
      ]
    };
  }
  
  // 智能參數推導
  private determineSignature(analysis: CodeAnalysis): FunctionSignature {
    const params: Parameter[] = [];
    const usedVariables = analysis.usedVariables;
    const modifiedVariables = analysis.modifiedVariables;
    
    // 使用但未修改的外部變數 -> 參數
    for (const variable of usedVariables) {
      if (this.isExternal(variable) && !modifiedVariables.has(variable)) {
        params.push({
          name: variable.name,
          type: variable.type,
          optional: false
        });
      }
    }
    
    // 修改的外部變數 -> 返回值或引用參數
    const returnValues = this.determineReturnValues(modifiedVariables);
    
    return {
      name: this.suggestFunctionName(analysis),
      parameters: params,
      returnType: this.determineReturnType(returnValues),
      async: analysis.hasAwait,
      generic: this.extractGenerics(analysis)
    };
  }
}
```

### 提取變數
```typescript
class ExtractVariableRefactoring {
  // 提取複雜表達式為變數
  async execute(expression: Expression): Promise<RefactorResult> {
    // 1. 分析表達式
    const analysis = this.analyzeExpression(expression);
    
    // 2. 生成變數名
    const variableName = this.suggestVariableName(analysis);
    
    // 3. 確定變數類型
    const variableType = this.inferType(expression);
    
    // 4. 找出所有相同的表達式
    const duplicates = this.findDuplicateExpressions(expression);
    
    // 5. 生成變數宣告
    const declaration = this.generateDeclaration(
      variableName,
      variableType,
      expression
    );
    
    // 6. 替換所有出現
    const replacements = duplicates.map(dup => ({
      type: 'replace',
      range: dup.range,
      content: variableName
    }));
    
    return {
      edits: [
        { type: 'insert', position: this.findDeclarationPosition(), content: declaration },
        ...replacements
      ]
    };
  }
}
```

## 內聯重構

### 內聯策略
```typescript
class InlineStrategy {
  // 判斷是否可以安全內聯
  canInline(target: InlineTarget): boolean {
    // 檢查副作用
    if (this.hasSideEffects(target)) {
      return false;
    }
    
    // 檢查引用次數
    if (target.references.length > this.threshold) {
      return false;
    }
    
    // 檢查複雜度
    if (this.isTooComplex(target)) {
      return false;
    }
    
    return true;
  }
  
  // 執行內聯
  inline(target: InlineTarget): RefactorEdit[] {
    const edits: RefactorEdit[] = [];
    
    // 1. 收集所有引用點
    const references = this.collectReferences(target);
    
    // 2. 準備替換內容
    const replacement = this.prepareReplacement(target);
    
    // 3. 處理每個引用
    for (const ref of references) {
      // 參數替換
      const localReplacement = this.substituteParameters(
        replacement,
        ref.arguments
      );
      
      // 變數重命名（避免衝突）
      const renamed = this.renameConflictingVariables(
        localReplacement,
        ref.scope
      );
      
      edits.push({
        type: 'replace',
        range: ref.range,
        content: renamed
      });
    }
    
    // 4. 刪除原始定義
    edits.push({
      type: 'delete',
      range: target.definition.range
    });
    
    return edits;
  }
}
```

## 設計模式重構

### 工廠模式轉換
```typescript
class FactoryPatternRefactoring {
  // 將直接實例化轉換為工廠模式
  convertToFactory(instantiations: NewExpression[]): RefactorResult {
    // 1. 分析所有實例化點
    const analysis = this.analyzeInstantiations(instantiations);
    
    // 2. 生成工廠介面
    const factoryInterface = this.generateFactoryInterface(analysis);
    
    // 3. 生成具體工廠
    const concreteFactory = this.generateConcreteFactory(analysis);
    
    // 4. 替換實例化為工廠呼叫
    const replacements = instantiations.map(inst => ({
      type: 'replace',
      range: inst.range,
      content: this.generateFactoryCall(inst)
    }));
    
    return {
      edits: [
        { type: 'create', path: 'factory.ts', content: factoryInterface },
        { type: 'create', path: 'concrete-factory.ts', content: concreteFactory },
        ...replacements
      ]
    };
  }
}
```

### 策略模式轉換
```typescript
class StrategyPatternRefactoring {
  // 將條件邏輯轉換為策略模式
  convertToStrategy(switchStatement: SwitchStatement): RefactorResult {
    // 1. 分析 switch 語句
    const strategies = this.extractStrategies(switchStatement);
    
    // 2. 生成策略介面
    const strategyInterface = `
      interface Strategy {
        execute(context: Context): Result;
      }
    `;
    
    // 3. 生成具體策略
    const concreteStrategies = strategies.map(strategy => 
      this.generateConcreteStrategy(strategy)
    );
    
    // 4. 生成策略上下文
    const context = this.generateContext(strategies);
    
    // 5. 替換 switch 語句
    const replacement = this.generateStrategyCall();
    
    return {
      edits: [
        { type: 'create', path: 'strategy.ts', content: strategyInterface },
        ...concreteStrategies.map(s => ({
          type: 'create',
          path: `${s.name}.ts`,
          content: s.content
        })),
        { type: 'create', path: 'context.ts', content: context },
        { type: 'replace', range: switchStatement.range, content: replacement }
      ]
    };
  }
}
```

## 程式碼優化重構

### 迴圈優化
```typescript
class LoopOptimization {
  // 迴圈合併
  mergeLoops(loops: ForLoop[]): RefactorResult {
    // 檢查是否可以合併
    if (!this.canMerge(loops)) {
      throw new Error('Loops cannot be merged');
    }
    
    // 合併迴圈體
    const mergedBody = this.mergeBodies(loops);
    
    // 生成新迴圈
    const mergedLoop = this.generateMergedLoop(loops[0], mergedBody);
    
    return {
      edits: [
        { type: 'replace', range: loops[0].range, content: mergedLoop },
        ...loops.slice(1).map(loop => ({
          type: 'delete',
          range: loop.range
        }))
      ]
    };
  }
  
  // 迴圈展開
  unrollLoop(loop: ForLoop, factor: number): RefactorResult {
    const unrolled = this.generateUnrolledLoop(loop, factor);
    
    return {
      edits: [{
        type: 'replace',
        range: loop.range,
        content: unrolled
      }]
    };
  }
}
```

## 安全檢查

### 前置條件驗證
```typescript
class PreconditionValidator {
  // 驗證重構前置條件
  validate(operation: RefactorOperation): ValidationResult {
    const violations: Violation[] = [];
    
    // 1. 語法正確性
    if (!this.isSyntacticallyCorrect(operation.target)) {
      violations.push({
        type: 'syntax-error',
        message: 'Code has syntax errors'
      });
    }
    
    // 2. 類型安全
    if (!this.isTypeSafe(operation)) {
      violations.push({
        type: 'type-error',
        message: 'Refactoring would break type safety'
      });
    }
    
    // 3. 測試覆蓋
    if (!this.hasTestCoverage(operation.target)) {
      violations.push({
        type: 'no-tests',
        message: 'No test coverage for refactored code',
        severity: 'warning'
      });
    }
    
    // 4. 依賴檢查
    if (this.hasExternalDependencies(operation)) {
      violations.push({
        type: 'external-dependency',
        message: 'Refactoring affects external dependencies',
        severity: 'warning'
      });
    }
    
    return {
      valid: violations.filter(v => v.severity !== 'warning').length === 0,
      violations
    };
  }
}
```

### 語義保持驗證
```typescript
class SemanticPreservation {
  // 驗證語義保持
  async verify(before: AST, after: AST): Promise<boolean> {
    // 1. 控制流等價
    const cfgBefore = this.buildCFG(before);
    const cfgAfter = this.buildCFG(after);
    
    if (!this.isEquivalent(cfgBefore, cfgAfter)) {
      return false;
    }
    
    // 2. 資料流等價
    const dfgBefore = this.buildDFG(before);
    const dfgAfter = this.buildDFG(after);
    
    if (!this.isEquivalent(dfgBefore, dfgAfter)) {
      return false;
    }
    
    // 3. 副作用等價
    const effectsBefore = this.analyzeSideEffects(before);
    const effectsAfter = this.analyzeSideEffects(after);
    
    return this.areEffectsEquivalent(effectsBefore, effectsAfter);
  }
}
```

## 批次重構

### 批次執行器
```typescript
class BatchRefactorExecutor {
  // 批次執行重構操作
  async executeBatch(operations: RefactorOperation[]): Promise<BatchResult> {
    // 1. 依賴排序
    const sorted = this.topologicalSort(operations);
    
    // 2. 衝突檢測
    const conflicts = this.detectConflicts(sorted);
    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }
    
    // 3. 建立檢查點
    const checkpoint = await this.createCheckpoint();
    
    // 4. 逐個執行
    const results: RefactorResult[] = [];
    for (const operation of sorted) {
      try {
        const result = await this.execute(operation);
        results.push(result);
      } catch (error) {
        // 回滾到檢查點
        await this.rollbackTo(checkpoint);
        throw error;
      }
    }
    
    // 5. 驗證結果
    await this.verifyBatchResult(results);
    
    return { success: true, results };
  }
}
```

## 開發檢查清單

### 功能完整性
- [ ] 所有基本重構操作
- [ ] 設計模式轉換
- [ ] 效能優化重構
- [ ] 批次操作支援
- [ ] 回滾機制完善

### 安全性保證
- [ ] 語義保持驗證
- [ ] 類型安全檢查
- [ ] 測試通過驗證
- [ ] 衝突檢測準確

## 疑難排解

### 常見問題

1. **重構失敗**
   - 檢查前置條件
   - 驗證語法正確性
   - 確認無外部依賴

2. **行為改變**
   - 執行測試驗證
   - 檢查副作用
   - 比對執行結果

3. **效能問題**
   - 使用增量重構
   - 啟用快取機制
   - 分批處理

## 未來改進
1. AI 輔助重構建議
2. 自動重構規則
3. 持續重構模式
4. 重構影響預測