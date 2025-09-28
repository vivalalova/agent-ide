# JavaScript Parser 插件實作指南

## 目標
實作 JavaScript Parser 插件，使用 Babel 作為底層解析器，實作 ParserPlugin 介面。

## 技術架構

### 技術選型
- **解析器**: @babel/parser
- **遍歷工具**: @babel/traverse
- **型別系統**: @babel/types
- **程式碼生成**: @babel/generator

### 檔案結構
```
src/plugins/javascript/
├── parser.ts           # 主要 Parser 實作
├── symbol-extractor.ts # 符號提取
├── dependency-analyzer.ts # 依賴分析
├── types.ts           # 型別定義和工具函式
├── index.ts           # 匯出介面
└── __tests__/         # 測試檔案
    ├── parser.test.ts
    ├── symbol-extractor.test.ts
    └── dependency-analyzer.test.ts
```

## 實作計畫

### Phase 1: 基礎架構 (TDD)
1. **建立型別定義** (types.ts)
   - 定義 JavaScriptAST 和 JavaScriptASTNode
   - 建立 Babel AST 到統一 AST 的映射
   - 定義錯誤類別 JavaScriptParseError

2. **實作主 Parser 類別** (parser.ts)
   - 實作 ParserPlugin 介面
   - parse() 方法：使用 @babel/parser
   - 處理 ES6+、JSX、Flow 語法

### Phase 2: 符號提取 (TDD)
1. **建立 JavaScriptSymbolExtractor** (symbol-extractor.ts)
   - 提取函式、類別、變數宣告
   - 處理 ES6 模組匯出
   - 支援解構賦值
   - 處理箭頭函式

### Phase 3: 依賴分析 (TDD)
1. **建立 JavaScriptDependencyAnalyzer** (dependency-analyzer.ts)
   - 分析 import/export 語句
   - 處理 require() 呼叫
   - 支援動態 import()
   - 分析 CommonJS 模組

### Phase 4: 進階功能 (TDD)
1. **實作 findReferences()**
   - 基於作用域的引用查找
   - 處理變數遮蔽

2. **實作 rename()**
   - 安全的變數重新命名
   - 保持作用域正確性

3. **實作 extractFunction()**
   - 提取選中的程式碼為函式

## Babel 配置

```typescript
const babelOptions = {
  sourceType: 'unambiguous', // 自動檢測 module 或 script
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
  plugins: [
    'jsx',
    'typescript', // 支援 JSDoc 型別註解
    'decorators-legacy',
    ['decorators', { decoratorsBeforeExport: true }],
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'exportDefaultFrom',
    'exportNamespaceFrom',
    'asyncGenerators',
    'functionBind',
    'functionSent',
    'dynamicImport',
    'numericSeparator',
    'optionalChaining',
    'importMeta',
    'bigInt',
    'optionalCatchBinding',
    'throwExpressions',
    ['pipelineOperator', { proposal: 'minimal' }],
    'nullishCoalescingOperator',
    'exportNamespaceFrom',
    'logicalAssignment',
    'privateIn',
    'moduleBlocks'
  ]
};
```

## 可重用的 TypeScript Parser 模式

### 1. AST 節點包裝
```typescript
export interface JavaScriptASTNode extends ASTNode {
  readonly babelNode: t.Node;
  readonly file: t.File;
}
```

### 2. 作用域管理
```typescript
class ScopeManager {
  private scopeStack: Scope[] = [];

  enterScope(type: ScopeType): void {
    this.scopeStack.push(new Scope(type));
  }

  exitScope(): void {
    this.scopeStack.pop();
  }

  getCurrentScope(): Scope | undefined {
    return this.scopeStack[this.scopeStack.length - 1];
  }
}
```

### 3. 位置轉換
```typescript
function babelLocationToPosition(loc: t.SourceLocation): Position {
  return {
    line: loc.start.line - 1, // Babel 使用 1-based
    column: loc.start.column,
    offset: 0 // 需要計算
  };
}
```

### 4. 錯誤處理
```typescript
export class JavaScriptParseError extends Error {
  constructor(
    message: string,
    public readonly location?: t.SourceLocation,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'JavaScriptParseError';
  }
}
```

## 測試策略

### 單元測試案例
1. **解析測試**
   - 變數宣告 (var, let, const)
   - 函式宣告 (function, arrow, method)
   - 類別宣告 (class, extends)
   - 模組系統 (import, export, require)
   - JSX 語法
   - 異步語法 (async/await, Promise)
   - ES6+ 特性

2. **符號提取測試**
   - 全域符號
   - 模組作用域符號
   - 區塊作用域符號
   - 巢狀作用域

3. **依賴分析測試**
   - ES6 import
   - CommonJS require
   - 動態 import()
   - Re-export

4. **錯誤處理測試**
   - 語法錯誤
   - 不支援的語法
   - 部分錯誤恢復

## TDD 執行流程

每個功能都遵循：
1. **紅燈**：先寫測試，確認失敗
2. **綠燈**：實作最小程式碼通過測試
3. **重構**：優化程式碼結構

## 驗證檢查點

- [ ] parse() 方法能正確解析各種 JavaScript 語法
- [ ] extractSymbols() 能提取所有符號
- [ ] findReferences() 能正確找到引用
- [ ] extractDependencies() 能分析所有依賴
- [ ] rename() 能安全重新命名
- [ ] extractFunction() 能提取函式
- [ ] 所有測試通過
- [ ] 與 ParserRegistry 正確整合