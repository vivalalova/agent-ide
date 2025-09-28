# Refactor 模組開發規範

## 實作狀態 ✅

### 實際檔案結構
```
refactor/
├── index.ts                    ✅ 模組入口
├── design-patterns.ts          ✅ 設計模式重構
├── extract-function.ts         ✅ 提取函式重構
├── inline-function.ts          ✅ 內聯函式重構
└── types.ts (如需要)           ⏳ 型別定義
```

### 實作功能狀態
- ✅ 提取函式重構
- ✅ 內聯函式重構
- ✅ 設計模式重構
- ⏳ 提取變數重構
- ⏳ 批次重構執行器
- ⏳ 安全性檢查

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
│   │   └── extract-class.ts       # 提取類別
│   ├── inline/
│   │   ├── inline-function.ts     # 內聯函式
│   │   └── inline-variable.ts     # 內聯變數
│   └── transform/
│       ├── change-signature.ts    # 改變簽名
│       └── encapsulate-field.ts   # 封裝欄位
├── patterns/
│   ├── design-patterns.ts    # 設計模式重構
│   └── code-smells.ts        # 程式碼異味重構
├── validators/
│   ├── precondition.ts       # 前置條件檢查
│   └── semantic.ts           # 語義驗證
└── types.ts                  # 型別定義
```

## 提取重構實作

### 提取函式
```typescript
class ExtractFunctionRefactoring {
  async execute(selection: CodeSelection): Promise<RefactorResult> {
    // 1. 分析選中的程式碼
    const analysis = await this.analyze(selection);

    // 2. 確定參數和返回值
    const signature = this.determineSignature(analysis);

    // 3. 生成新函式
    const newFunction = this.generateFunction(analysis.code, signature);

    // 4. 替換原始程式碼
    const replacement = this.generateCall(signature);

    return {
      edits: [
        { type: 'insert', position: this.findInsertPosition(), content: newFunction },
        { type: 'replace', range: selection.range, content: replacement }
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

    return {
      name: this.suggestFunctionName(analysis),
      parameters: params,
      returnType: this.determineReturnType(analysis),
      async: analysis.hasAwait
    };
  }
}
```

### 提取變數
```typescript
class ExtractVariableRefactoring {
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
    const declaration = this.generateDeclaration(variableName, variableType, expression);

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
    if (this.hasSideEffects(target)) return false;

    // 檢查引用次數
    if (target.references.length > this.threshold) return false;

    // 檢查複雜度
    if (this.isTooComplex(target)) return false;

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
      const localReplacement = this.substituteParameters(replacement, ref.arguments);

      // 變數重命名（避免衝突）
      const renamed = this.renameConflictingVariables(localReplacement, ref.scope);

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

    // 4. 替換 switch 語句
    const replacement = this.generateStrategyCall();

    return {
      edits: [
        { type: 'create', path: 'strategy.ts', content: strategyInterface },
        ...concreteStrategies.map(s => ({
          type: 'create',
          path: `${s.name}.ts`,
          content: s.content
        })),
        { type: 'replace', range: switchStatement.range, content: replacement }
      ]
    };
  }
}
```

## 安全檢查

### 前置條件驗證
```typescript
class PreconditionValidator {
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

## 開發檢查清單

### 功能完整性
- [x] 所有基本重構操作
- [x] 設計模式轉換
- [ ] 效能優化重構
- [ ] 批次操作支援
- [ ] 回滾機制完善

### 安全性保證
- [ ] 語義保持驗證
- [ ] 類型安全檢查
- [ ] 測試通過驗證
- [ ] 衝突檢測準確