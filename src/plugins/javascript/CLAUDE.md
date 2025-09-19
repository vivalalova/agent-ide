# JavaScript Parser 插件開發規範

## 模組職責
使用 Babel 提供完整的 JavaScript 語法解析，支援最新 ECMAScript 標準和實驗性特性，轉換為統一 AST 格式。

## 開發原則

### 1. Babel 生態系統
- **@babel/parser**：作為核心解析器
- **@babel/traverse**：用於 AST 遍歷
- **@babel/types**：用於 AST 節點操作
- **@babel/generator**：用於程式碼生成

### 2. 支援廣泛性
- ES2015 至最新標準
- JSX 語法
- Flow 類型註解
- 實驗性語法提案

### 3. 效能考量
- AST 結果快取
- 插件化架構
- 漸進式解析
- Source Map 支援

## 實作規範

### 檔案結構
```
javascript/
├── index.ts                 # 插件入口
├── plugin.ts                # JavaScriptParserPlugin 實作
├── babel/
│   ├── parser-config.ts        # Babel 解析器設定
│   ├── parser-wrapper.ts       # 解析器封裝
│   ├── plugin-manager.ts       # 插件管理
│   └── preset-manager.ts       # Preset 管理
├── ast/
│   ├── converter.ts            # AST 轉換器
│   ├── visitor.ts              # AST 訪問器
│   ├── transformer.ts          # AST 轉換器
│   └── scope-analyzer.ts       # 作用域分析
├── features/
│   ├── jsx-processor.ts        # JSX 處理
│   ├── flow-handler.ts         # Flow 處理
│   ├── es-features.ts          # ES 特性處理
│   └── comment-extractor.ts    # 註釋提取
├── optimization/
│   ├── cache-manager.ts        # 快取管理
│   ├── incremental-parser.ts   # 增量解析
│   └── worker-pool.ts          # Worker 池
└── types.ts                 # 型別定義
```

## Babel 整合

### 解析器設定
```typescript
class BabelParserConfig {
  // 生成 Babel 解析器選項
  getParserOptions(customOptions?: Partial<ParserOptions>): ParserOptions {
    const defaultOptions: ParserOptions = {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      startLine: 1,
      tokens: true,
      ranges: true,
      attachComment: true,
      
      // 插件設定
      plugins: [
        // ES 提案
        'asyncGenerators',
        'bigInt',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'doExpressions',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'functionBind',
        'functionSent',
        'importMeta',
        'logicalAssignment',
        'nullishCoalescingOperator',
        'numericSeparator',
        'objectRestSpread',
        'optionalCatchBinding',
        'optionalChaining',
        'partialApplication',
        'privateIn',
        'throwExpressions',
        'topLevelAwait',
        
        // JSX
        'jsx',
        
        // Flow (可選)
        // 'flow',
        // 'flowComments'
      ]
    };
    
    return { ...defaultOptions, ...customOptions };
  }
  
  // 動態調整插件
  adjustPlugins(code: string): string[] {
    const plugins: string[] = [];
    
    // 檢測 JSX
    if (this.hasJSX(code)) {
      plugins.push('jsx');
    }
    
    // 檢測 Flow
    if (this.hasFlow(code)) {
      plugins.push('flow');
      plugins.push('flowComments');
    }
    
    // 檢測裝飾器
    if (this.hasDecorators(code)) {
      plugins.push('decorators-legacy');
    }
    
    return plugins;
  }
}
```

### 解析器封裝
```typescript
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import generate from '@babel/generator';

class BabelParserWrapper {
  private config: BabelParserConfig;
  
  // 解析程式碼
  parse(code: string, options?: ParseOptions): BabelAST {
    try {
      // 動態調整選項
      const parserOptions = this.config.getParserOptions({
        ...options,
        plugins: [
          ...this.config.getParserOptions().plugins,
          ...this.config.adjustPlugins(code)
        ]
      });
      
      // 解析
      const ast = parser.parse(code, parserOptions);
      
      // 附加元資料
      this.attachMetadata(ast, code);
      
      return ast;
    } catch (error) {
      // 處理解析錯誤
      throw this.handleParseError(error);
    }
  }
  
  // 遍歷 AST
  traverse(ast: BabelAST, visitor: Visitor): void {
    traverse(ast, visitor);
  }
  
  // 生成程式碼
  generate(ast: BabelAST, options?: GeneratorOptions): GeneratorResult {
    return generate(ast, {
      sourceMaps: true,
      comments: true,
      compact: false,
      ...options
    });
  }
  
  // 附加元資料
  private attachMetadata(ast: BabelAST, code: string): void {
    // 附加原始程式碼
    ast.code = code;
    
    // 附加檔案資訊
    ast.loc = {
      start: { line: 1, column: 0 },
      end: this.getEndLocation(code)
    };
    
    // 附加範圍資訊
    ast.range = [0, code.length];
  }
}
```

## AST 轉換

### Babel AST 轉換器
```typescript
class BabelASTConverter {
  // 轉換 Babel AST 到統一格式
  convert(babelAST: BabelAST): UnifiedAST {
    const unified: UnifiedAST = {
      type: 'Program',
      root: this.convertNode(babelAST),
      sourceFile: babelAST.filename || 'unknown',
      language: 'javascript',
      parser: 'babel',
      metadata: {
        babelVersion: this.getBabelVersion(),
        sourceType: babelAST.sourceType,
        hasJSX: this.hasJSXElements(babelAST),
        hasFlow: this.hasFlowTypes(babelAST),
        ecmaVersion: this.detectECMAVersion(babelAST)
      },
      errors: this.extractErrors(babelAST),
      comments: this.extractComments(babelAST),
      tokens: this.extractTokens(babelAST)
    };
    
    return unified;
  }
  
  // 遞迴轉換節點
  private convertNode(node: BabelNode): UnifiedASTNode {
    const unified: UnifiedASTNode = {
      type: this.mapNodeType(node.type),
      range: node.range || { start: node.start, end: node.end },
      loc: node.loc,
      children: []
    };
    
    // 處理特定節點屬性
    this.processNodeProperties(node, unified);
    
    // 處理子節點
    this.processChildren(node, unified);
    
    return unified;
  }
  
  // 節點類型映射
  private mapNodeType(babelType: string): string {
    const mapping: Record<string, string> = {
      'File': 'Program',
      'Program': 'Program',
      'FunctionDeclaration': 'FunctionDeclaration',
      'FunctionExpression': 'FunctionExpression',
      'ArrowFunctionExpression': 'ArrowFunction',
      'ClassDeclaration': 'ClassDeclaration',
      'ClassExpression': 'ClassExpression',
      'VariableDeclaration': 'VariableDeclaration',
      'VariableDeclarator': 'VariableDeclarator',
      'Identifier': 'Identifier',
      'CallExpression': 'CallExpression',
      'MemberExpression': 'MemberExpression',
      'NewExpression': 'NewExpression',
      'ImportDeclaration': 'ImportDeclaration',
      'ExportNamedDeclaration': 'ExportNamedDeclaration',
      'ExportDefaultDeclaration': 'ExportDefaultDeclaration',
      'JSXElement': 'JSXElement',
      'JSXFragment': 'JSXFragment',
      'JSXOpeningElement': 'JSXOpeningElement',
      'JSXClosingElement': 'JSXClosingElement',
      'JSXAttribute': 'JSXAttribute',
      'JSXSpreadAttribute': 'JSXSpreadAttribute',
      'JSXText': 'JSXText',
      'JSXExpressionContainer': 'JSXExpressionContainer'
    };
    
    return mapping[babelType] || `Babel_${babelType}`;
  }
  
  // 處理子節點
  private processChildren(node: BabelNode, unified: UnifiedASTNode): void {
    traverse(node, {
      enter: (path) => {
        // 只處理直接子節點
        if (path.parent === node) {
          unified.children.push(this.convertNode(path.node));
          path.skip(); // 不遞迴處理
        }
      }
    });
  }
}
```

## 作用域分析

### 作用域分析器
```typescript
class ScopeAnalyzer {
  // 分析作用域
  analyzeScope(ast: BabelAST): ScopeInfo {
    const scopes: Scope[] = [];
    const bindings: Map<string, Binding[]> = new Map();
    
    traverse(ast, {
      // 函式作用域
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': (path) => {
        const scope = this.createScope(path, 'function');
        scopes.push(scope);
        
        // 收集參數綁定
        this.collectParameterBindings(path, scope);
      },
      
      // 塊級作用域
      BlockStatement: (path) => {
        const scope = this.createScope(path, 'block');
        scopes.push(scope);
      },
      
      // 變數綁定
      VariableDeclarator: (path) => {
        const binding = this.createBinding(path);
        const scope = path.scope;
        
        if (!bindings.has(scope.uid)) {
          bindings.set(scope.uid, []);
        }
        
        bindings.get(scope.uid)!.push(binding);
      },
      
      // 識別符引用
      Identifier: (path) => {
        if (path.isReferencedIdentifier()) {
          this.recordReference(path);
        }
      }
    });
    
    return {
      scopes,
      bindings,
      globals: this.findGlobals(ast)
    };
  }
  
  // 建立作用域
  private createScope(path: any, type: ScopeType): Scope {
    return {
      id: path.scope.uid,
      type,
      parent: path.scope.parent?.uid,
      bindings: Object.keys(path.scope.bindings),
      references: [],
      range: {
        start: path.node.start,
        end: path.node.end
      }
    };
  }
  
  // 建立綁定
  private createBinding(path: any): Binding {
    const node = path.node;
    const id = node.id;
    
    return {
      name: id.name,
      kind: path.parent.kind, // const, let, var
      scope: path.scope.uid,
      references: [],
      constant: path.scope.getBinding(id.name)?.constant || false,
      range: {
        start: node.start,
        end: node.end
      }
    };
  }
  
  // 找出全域變數
  private findGlobals(ast: BabelAST): string[] {
    const globals = new Set<string>();
    
    traverse(ast, {
      ReferencedIdentifier(path) {
        const binding = path.scope.getBinding(path.node.name);
        if (!binding) {
          globals.add(path.node.name);
        }
      }
    });
    
    return Array.from(globals);
  }
}
```

## 特殊語法處理

### JSX 處理器
```typescript
class JSXProcessor {
  // 處理 JSX 元素
  processJSX(node: JSXElement | JSXFragment): JSXInfo {
    return {
      type: node.type === 'JSXFragment' ? 'Fragment' : 'Element',
      name: this.getElementName(node),
      attributes: this.extractAttributes(node),
      children: this.extractChildren(node),
      selfClosing: this.isSelfClosing(node),
      range: node.range,
      loc: node.loc
    };
  }
  
  // 提取元素名稱
  private getElementName(node: JSXElement | JSXFragment): string {
    if (node.type === 'JSXFragment') {
      return 'Fragment';
    }
    
    const opening = node.openingElement;
    const name = opening.name;
    
    if (t.isJSXIdentifier(name)) {
      return name.name;
    } else if (t.isJSXMemberExpression(name)) {
      return this.getMemberExpressionName(name);
    } else if (t.isJSXNamespacedName(name)) {
      return `${name.namespace.name}:${name.name.name}`;
    }
    
    return 'unknown';
  }
  
  // 提取屬性
  private extractAttributes(node: JSXElement | JSXFragment): JSXAttribute[] {
    if (node.type === 'JSXFragment') {
      return [];
    }
    
    const attributes: JSXAttribute[] = [];
    const opening = node.openingElement;
    
    for (const attr of opening.attributes) {
      if (t.isJSXAttribute(attr)) {
        attributes.push({
          name: attr.name.name,
          value: this.extractAttributeValue(attr.value),
          spread: false
        });
      } else if (t.isJSXSpreadAttribute(attr)) {
        attributes.push({
          name: '...spread',
          value: attr.argument,
          spread: true
        });
      }
    }
    
    return attributes;
  }
  
  // 提取屬性值
  private extractAttributeValue(value: any): any {
    if (!value) return true; // 無值屬性
    
    if (t.isJSXExpressionContainer(value)) {
      return value.expression;
    } else if (t.isStringLiteral(value)) {
      return value.value;
    } else if (t.isJSXElement(value)) {
      return this.processJSX(value);
    }
    
    return value;
  }
}
```

### ES 特性處理
```typescript
class ESFeaturesHandler {
  // 處理非同步函式
  handleAsync(node: Function): AsyncInfo {
    return {
      isAsync: node.async || false,
      isGenerator: node.generator || false,
      awaitExpressions: this.findAwaitExpressions(node)
    };
  }
  
  // 處理解構賦值
  handleDestructuring(node: Pattern): DestructuringInfo {
    if (t.isObjectPattern(node)) {
      return {
        type: 'object',
        properties: node.properties.map(prop => ({
          key: this.getPropertyKey(prop),
          value: prop.value,
          computed: prop.computed,
          shorthand: prop.shorthand
        }))
      };
    } else if (t.isArrayPattern(node)) {
      return {
        type: 'array',
        elements: node.elements.map(elem => 
          elem ? this.handleDestructuring(elem) : null
        )
      };
    }
    
    return { type: 'identifier', name: node.name };
  }
  
  // 處理展開運算符
  handleSpread(node: SpreadElement): SpreadInfo {
    return {
      type: 'spread',
      argument: node.argument,
      context: this.getSpreadContext(node)
    };
  }
  
  // 處理模板字串
  handleTemplateLiteral(node: TemplateLiteral): TemplateInfo {
    return {
      type: 'template',
      quasis: node.quasis.map(q => q.value.raw),
      expressions: node.expressions,
      tag: node.tag // Tagged template
    };
  }
  
  // 處理動態 import
  handleDynamicImport(node: CallExpression): DynamicImportInfo {
    if (node.callee.type === 'Import') {
      return {
        type: 'dynamic-import',
        source: node.arguments[0],
        isAsync: true
      };
    }
    return null;
  }
}
```

## 錯誤處理

### 解析錯誤處理
```typescript
class ParseErrorHandler {
  // 處理解析錯誤
  handleParseError(error: any): ParseError {
    if (error.code === 'BABEL_PARSER_SYNTAX_ERROR') {
      return {
        type: 'SyntaxError',
        message: error.message,
        line: error.loc?.line,
        column: error.loc?.column,
        pos: error.pos,
        code: error.code,
        reasonCode: error.reasonCode,
        recovery: this.suggestRecovery(error)
      };
    }
    
    return {
      type: 'ParseError',
      message: error.message || 'Unknown parse error',
      stack: error.stack
    };
  }
  
  // 建議復原策略
  private suggestRecovery(error: any): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    
    // 缺少分號
    if (error.reasonCode === 'MissingSemicolon') {
      suggestions.push({
        type: 'insert',
        position: error.pos,
        content: ';',
        message: 'Insert semicolon'
      });
    }
    
    // 未關閉的括號
    if (error.reasonCode === 'UnterminatedString') {
      suggestions.push({
        type: 'insert',
        position: error.pos,
        content: '"',
        message: 'Close string literal'
      });
    }
    
    // 非法的 await
    if (error.reasonCode === 'AwaitNotInAsyncFunction') {
      suggestions.push({
        type: 'modify',
        message: 'Add async to containing function'
      });
    }
    
    return suggestions;
  }
  
  // 容錯解析
  tolerantParse(code: string): { ast?: BabelAST; errors: ParseError[] } {
    const errors: ParseError[] = [];
    
    try {
      // 嘗試正常解析
      const ast = this.parse(code);
      return { ast, errors: [] };
    } catch (error) {
      errors.push(this.handleParseError(error));
      
      // 嘗試復原
      const recovered = this.attemptRecovery(code, error);
      if (recovered) {
        return { ast: recovered, errors };
      }
      
      // 返回部分 AST
      const partial = this.parsePartial(code, error.pos);
      return { ast: partial, errors };
    }
  }
}
```

## 效能優化

### Worker 池
```typescript
class WorkerPool {
  private workers: Worker[] = [];
  private queue: ParseTask[] = [];
  private busy: Set<Worker> = new Set();
  
  constructor(size: number = 4) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker('./babel-worker.js');
      this.workers.push(worker);
    }
  }
  
  // 非同步解析
  async parseAsync(code: string, options?: ParseOptions): Promise<BabelAST> {
    const worker = await this.getAvailableWorker();
    
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'parse-result') {
          worker.removeEventListener('message', handler);
          this.releaseWorker(worker);
          
          if (event.data.error) {
            reject(event.data.error);
          } else {
            resolve(event.data.ast);
          }
        }
      };
      
      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'parse',
        code,
        options
      });
    });
  }
  
  // 取得可用 Worker
  private async getAvailableWorker(): Promise<Worker> {
    // 有空閒 Worker
    const available = this.workers.find(w => !this.busy.has(w));
    if (available) {
      this.busy.add(available);
      return available;
    }
    
    // 等待 Worker 釋放
    return new Promise(resolve => {
      const check = setInterval(() => {
        const worker = this.workers.find(w => !this.busy.has(w));
        if (worker) {
          clearInterval(check);
          this.busy.add(worker);
          resolve(worker);
        }
      }, 10);
    });
  }
  
  // 釋放 Worker
  private releaseWorker(worker: Worker): void {
    this.busy.delete(worker);
    this.processQueue();
  }
}
```

### 增量解析
```typescript
class IncrementalParser {
  private cache = new Map<string, CachedAST>();
  
  // 增量解析
  async parseIncremental(
    code: string,
    changes: TextChange[],
    previousAST?: BabelAST
  ): Promise<BabelAST> {
    // 如果沒有先前的 AST，完整解析
    if (!previousAST) {
      return this.parse(code);
    }
    
    // 判斷是否可增量更新
    if (!this.canIncrementalUpdate(changes)) {
      return this.parse(code);
    }
    
    // 對每個變更應用增量更新
    let ast = previousAST;
    for (const change of changes) {
      ast = await this.applyChange(ast, change);
    }
    
    return ast;
  }
  
  // 應用單個變更
  private async applyChange(
    ast: BabelAST,
    change: TextChange
  ): Promise<BabelAST> {
    // 找出受影響的節點
    const affectedNodes = this.findAffectedNodes(ast, change.range);
    
    // 重新解析受影響的節點
    const newNodes = await this.reparseNodes(affectedNodes, change.text);
    
    // 更新 AST
    return this.updateAST(ast, affectedNodes, newNodes);
  }
}
```

## 開發檢查清單

### 功能完整性
- [ ] Babel 解析器完整整合
- [ ] 所有 ES 特性支援
- [ ] JSX 正確處理
- [ ] Flow 類型支援
- [ ] 作用域分析準確
- [ ] 錯誤復原機制

### 效能指標
- [ ] 單檔案解析 < 30ms
- [ ] Worker 並行處理
- [ ] 增量更新 < 10ms
- [ ] 記憶體使用 < 50MB

## 疑難排解

### 常見問題

1. **解析失敗**
   - 檢查插件設定
   - 確認 ECMAScript 版本
   - 啟用容錯模式

2. **JSX 解析錯誤**
   - 確保啟用 jsx 插件
   - 檢查檔案副檔名
   - 設定正確的 pragma

3. **效能問題**
   - 使用 Worker 池
   - 啟用快取
   - 減少 traverse 次數

## 未來改進
1. 支援更多 Babel 插件
2. Source Map 完整支援
3. 與 Babel 轉換整合
4. 支援自訂語法擴展