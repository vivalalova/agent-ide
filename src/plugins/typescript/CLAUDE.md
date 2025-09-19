# TypeScript Parser 插件開發規範

## 模組職責
提供 TypeScript 程式碼的完整語法解析能力，利用 TypeScript Compiler API 產生準確的 AST，並轉換為框架統一格式。

## 開發原則

### 1. 原生 API 優先
- **TypeScript Compiler API**：充分利用官方 API
- **類型資訊保留**：完整保存類型系統資訊
- **增量編譯**：支援 incremental compilation
- **診斷資訊**：提供詳細的錯誤和警告

### 2. 效能優化
- Program 實例重用
- SourceFile 快取
- 類型檢查器共享
- Watch 模式支援

### 3. 功能完整性
- 支援所有 TypeScript 語法
- 保留 JSDoc 註解
- 處理裝飾器
- 支援 JSX/TSX

## 實作規範

### 檔案結構
```
typescript/
├── index.ts                 # 插件入口
├── plugin.ts                # TypeScriptParserPlugin 實作
├── compiler/
│   ├── program-manager.ts      # Program 管理
│   ├── source-file-cache.ts    # SourceFile 快取
│   ├── type-checker.ts         # 類型檢查器封裝
│   └── diagnostics.ts          # 診斷處理
├── ast/
│   ├── converter.ts            # AST 轉換器
│   ├── node-mapper.ts          # 節點映射
│   ├── type-extractor.ts       # 類型提取
│   └── symbol-resolver.ts      # 符號解析
├── features/
│   ├── jsx-handler.ts          # JSX/TSX 處理
│   ├── decorator-parser.ts     # 裝飾器解析
│   ├── jsdoc-extractor.ts      # JSDoc 提取
│   └── import-resolver.ts      # Import 解析
├── incremental/
│   ├── watch-compiler.ts       # Watch 模式編譯器
│   ├── change-detector.ts      # 變更檢測
│   └── cache-manager.ts        # 快取管理
└── types.ts                 # 型別定義
```

## TypeScript Compiler API 整合

### Program 管理
```typescript
class ProgramManager {
  private program: ts.Program | null = null;
  private languageService: ts.LanguageService | null = null;
  private host: ts.CompilerHost;
  
  // 建立或更新 Program
  createProgram(files: string[], options?: ts.CompilerOptions): ts.Program {
    const defaultOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      lib: ['lib.esnext.d.ts'],
      jsx: ts.JsxEmit.React,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      skipLibCheck: true,
      strict: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    // 重用現有 Program 進行增量編譯
    if (this.program) {
      this.program = ts.createProgram(
        files,
        mergedOptions,
        this.host,
        this.program
      );
    } else {
      this.program = ts.createProgram(files, mergedOptions, this.host);
    }
    
    return this.program;
  }
  
  // 取得 TypeChecker
  getTypeChecker(): ts.TypeChecker {
    if (!this.program) {
      throw new Error('Program not initialized');
    }
    return this.program.getTypeChecker();
  }
  
  // 建立 Language Service（用於增量分析）
  createLanguageService(rootFiles: string[]): ts.LanguageService {
    const servicesHost: ts.LanguageServiceHost = {
      getScriptFileNames: () => rootFiles,
      getScriptVersion: (fileName) => this.getFileVersion(fileName),
      getScriptSnapshot: (fileName) => {
        if (!fs.existsSync(fileName)) return undefined;
        return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
      },
      getCurrentDirectory: () => process.cwd(),
      getCompilationSettings: () => this.getCompilerOptions(),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory
    };
    
    this.languageService = ts.createLanguageService(
      servicesHost,
      ts.createDocumentRegistry()
    );
    
    return this.languageService;
  }
}
```

### AST 轉換
```typescript
class TypeScriptASTConverter {
  private typeChecker: ts.TypeChecker;
  
  // 轉換 TypeScript AST 到統一格式
  convert(sourceFile: ts.SourceFile): UnifiedAST {
    const ast: UnifiedAST = {
      type: 'Program',
      root: this.convertNode(sourceFile),
      sourceFile: sourceFile.fileName,
      language: 'typescript',
      parser: 'typescript-compiler-api',
      metadata: {
        version: ts.version,
        target: this.getTargetString(),
        module: this.getModuleString(),
        jsx: this.hasJSX(sourceFile)
      },
      errors: this.extractDiagnostics(sourceFile),
      comments: this.extractComments(sourceFile),
      tokens: this.extractTokens(sourceFile)
    };
    
    return ast;
  }
  
  // 遞迴轉換節點
  private convertNode(node: ts.Node): UnifiedASTNode {
    const unified: UnifiedASTNode = {
      type: this.mapNodeKind(node.kind),
      range: {
        start: node.getStart(),
        end: node.getEnd()
      },
      loc: this.getLocation(node),
      children: []
    };
    
    // 添加類型資訊
    if (this.typeChecker) {
      const type = this.typeChecker.getTypeAtLocation(node);
      unified.typeInfo = this.extractTypeInfo(type);
    }
    
    // 添加符號資訊
    const symbol = (node as any).symbol;
    if (symbol) {
      unified.symbolInfo = this.extractSymbolInfo(symbol);
    }
    
    // 處理特定節點類型的額外資訊
    this.addNodeSpecificInfo(node, unified);
    
    // 遞迴處理子節點
    ts.forEachChild(node, child => {
      unified.children.push(this.convertNode(child));
    });
    
    return unified;
  }
  
  // 節點類型映射
  private mapNodeKind(kind: ts.SyntaxKind): string {
    const mapping: Record<ts.SyntaxKind, string> = {
      [ts.SyntaxKind.SourceFile]: 'Program',
      [ts.SyntaxKind.ClassDeclaration]: 'ClassDeclaration',
      [ts.SyntaxKind.FunctionDeclaration]: 'FunctionDeclaration',
      [ts.SyntaxKind.VariableDeclaration]: 'VariableDeclaration',
      [ts.SyntaxKind.InterfaceDeclaration]: 'InterfaceDeclaration',
      [ts.SyntaxKind.TypeAliasDeclaration]: 'TypeAliasDeclaration',
      [ts.SyntaxKind.EnumDeclaration]: 'EnumDeclaration',
      [ts.SyntaxKind.ImportDeclaration]: 'ImportDeclaration',
      [ts.SyntaxKind.ExportDeclaration]: 'ExportDeclaration',
      [ts.SyntaxKind.MethodDeclaration]: 'MethodDeclaration',
      [ts.SyntaxKind.PropertyDeclaration]: 'PropertyDeclaration',
      [ts.SyntaxKind.Constructor]: 'Constructor',
      [ts.SyntaxKind.GetAccessor]: 'GetAccessor',
      [ts.SyntaxKind.SetAccessor]: 'SetAccessor',
      [ts.SyntaxKind.CallExpression]: 'CallExpression',
      [ts.SyntaxKind.NewExpression]: 'NewExpression',
      [ts.SyntaxKind.ArrowFunction]: 'ArrowFunction',
      [ts.SyntaxKind.JsxElement]: 'JSXElement',
      [ts.SyntaxKind.JsxSelfClosingElement]: 'JSXSelfClosingElement',
      [ts.SyntaxKind.Decorator]: 'Decorator'
    };
    
    return mapping[kind] || `TS_${ts.SyntaxKind[kind]}`;
  }
}
```

## 類型系統處理

### 類型資訊提取
```typescript
class TypeExtractor {
  private typeChecker: ts.TypeChecker;
  
  // 提取完整類型資訊
  extractTypeInfo(type: ts.Type): TypeInfo {
    return {
      name: this.typeChecker.typeToString(type),
      flags: this.extractTypeFlags(type),
      symbol: type.symbol ? this.extractSymbolInfo(type.symbol) : undefined,
      typeArguments: this.extractTypeArguments(type),
      members: this.extractMembers(type),
      callSignatures: this.extractCallSignatures(type),
      constructSignatures: this.extractConstructSignatures(type),
      indexSignatures: this.extractIndexSignatures(type),
      baseTypes: this.extractBaseTypes(type),
      isUnion: type.isUnion(),
      isIntersection: type.isIntersection(),
      isLiteral: type.isLiteral(),
      isEnum: type.flags & ts.TypeFlags.Enum
    };
  }
  
  // 提取泛型參數
  private extractTypeArguments(type: ts.Type): TypeInfo[] {
    const typeArgs: TypeInfo[] = [];
    
    if (type.flags & ts.TypeFlags.Object) {
      const objectType = type as ts.ObjectType;
      const typeReference = objectType as ts.TypeReference;
      
      if (typeReference.typeArguments) {
        for (const arg of typeReference.typeArguments) {
          typeArgs.push(this.extractTypeInfo(arg));
        }
      }
    }
    
    return typeArgs;
  }
  
  // 提取類型成員
  private extractMembers(type: ts.Type): MemberInfo[] {
    const members: MemberInfo[] = [];
    
    if (type.symbol && type.symbol.members) {
      type.symbol.members.forEach((member, key) => {
        members.push({
          name: key.toString(),
          type: this.extractMemberType(member),
          flags: member.flags,
          optional: !!(member.flags & ts.SymbolFlags.Optional),
          readonly: !!(member.flags & ts.SymbolFlags.Readonly)
        });
      });
    }
    
    return members;
  }
}
```

## 增量解析

### Watch 模式編譯器
```typescript
class WatchCompiler {
  private watchProgram: ts.WatchOfConfigFile<ts.SemanticDiagnosticsBuilderProgram> | null = null;
  private changeCallbacks: Set<(changes: FileChange[]) => void> = new Set();
  
  // 啟動 Watch 模式
  startWatching(configPath: string): void {
    const createProgram = ts.createSemanticDiagnosticsBuilderProgram;
    
    const host = ts.createWatchCompilerHost(
      configPath,
      {},
      ts.sys,
      createProgram,
      this.reportDiagnostic,
      this.reportWatchStatus
    );
    
    // 攔截檔案變更
    const originalWatchFile = host.watchFile;
    host.watchFile = (path, callback) => {
      return originalWatchFile(path, (fileName, eventKind) => {
        this.handleFileChange(fileName, eventKind);
        callback(fileName, eventKind);
      });
    };
    
    this.watchProgram = ts.createWatchProgram(host);
  }
  
  // 處理檔案變更
  private handleFileChange(fileName: string, eventKind: ts.FileWatcherEventKind): void {
    const change: FileChange = {
      file: fileName,
      type: this.mapEventKind(eventKind),
      timestamp: Date.now()
    };
    
    // 通知所有監聽器
    this.changeCallbacks.forEach(callback => callback([change]));
  }
  
  // 增量解析變更的檔案
  async parseIncremental(fileName: string): Promise<UnifiedAST> {
    const program = this.watchProgram?.getProgram().getProgram();
    if (!program) {
      throw new Error('Watch program not initialized');
    }
    
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
      throw new Error(`Source file not found: ${fileName}`);
    }
    
    // 只解析變更的部分
    return this.converter.convert(sourceFile);
  }
}
```

## 特殊語法處理

### JSX/TSX 處理
```typescript
class JSXHandler {
  // 處理 JSX 元素
  handleJSXElement(node: ts.JsxElement | ts.JsxSelfClosingElement): JSXInfo {
    return {
      type: 'JSXElement',
      tagName: this.extractTagName(node),
      attributes: this.extractAttributes(node),
      children: this.extractChildren(node),
      isFragment: this.isFragment(node),
      isSelfClosing: ts.isJsxSelfClosingElement(node)
    };
  }
  
  // 提取 JSX 屬性
  private extractAttributes(node: ts.JsxElement | ts.JsxSelfClosingElement): JSXAttribute[] {
    const attributes: JSXAttribute[] = [];
    const attrs = ts.isJsxElement(node) 
      ? node.openingElement.attributes 
      : node.attributes;
    
    attrs.properties.forEach(attr => {
      if (ts.isJsxAttribute(attr)) {
        attributes.push({
          name: attr.name.getText(),
          value: attr.initializer ? this.extractAttributeValue(attr.initializer) : true,
          isSpread: false
        });
      } else if (ts.isJsxSpreadAttribute(attr)) {
        attributes.push({
          name: '...spread',
          value: attr.expression,
          isSpread: true
        });
      }
    });
    
    return attributes;
  }
}
```

### 裝飾器解析
```typescript
class DecoratorParser {
  private typeChecker: ts.TypeChecker;
  
  // 解析裝飾器
  parseDecorator(decorator: ts.Decorator): DecoratorInfo {
    const expression = decorator.expression;
    
    return {
      name: this.getDecoratorName(expression),
      arguments: this.getDecoratorArguments(expression),
      target: this.getDecoratorTarget(decorator.parent),
      metadata: this.extractMetadata(decorator)
    };
  }
  
  // 提取裝飾器名稱
  private getDecoratorName(expression: ts.Expression): string {
    if (ts.isCallExpression(expression)) {
      return expression.expression.getText();
    }
    return expression.getText();
  }
  
  // 提取裝飾器參數
  private getDecoratorArguments(expression: ts.Expression): any[] {
    if (!ts.isCallExpression(expression)) {
      return [];
    }
    
    return expression.arguments.map(arg => {
      // 嘗試編譯時求值
      const value = this.evaluateExpression(arg);
      if (value !== undefined) {
        return value;
      }
      
      // 返回 AST 節點
      return this.converter.convertNode(arg);
    });
  }
  
  // 編譯時求值
  private evaluateExpression(node: ts.Expression): any {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
        return (node as ts.StringLiteral).text;
      case ts.SyntaxKind.NumericLiteral:
        return Number((node as ts.NumericLiteral).text);
      case ts.SyntaxKind.TrueKeyword:
        return true;
      case ts.SyntaxKind.FalseKeyword:
        return false;
      case ts.SyntaxKind.NullKeyword:
        return null;
      case ts.SyntaxKind.ObjectLiteralExpression:
        return this.evaluateObjectLiteral(node as ts.ObjectLiteralExpression);
      case ts.SyntaxKind.ArrayLiteralExpression:
        return this.evaluateArrayLiteral(node as ts.ArrayLiteralExpression);
      default:
        return undefined;
    }
  }
}
```

## 診斷與錯誤處理

### 診斷資訊處理
```typescript
class DiagnosticsHandler {
  // 收集診斷資訊
  collectDiagnostics(program: ts.Program, sourceFile?: ts.SourceFile): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // 語法錯誤
    const syntacticDiagnostics = sourceFile
      ? program.getSyntacticDiagnostics(sourceFile)
      : program.getSyntacticDiagnostics();
    
    // 語義錯誤
    const semanticDiagnostics = sourceFile
      ? program.getSemanticDiagnostics(sourceFile)
      : program.getSemanticDiagnostics();
    
    // 宣告診斷
    const declarationDiagnostics = sourceFile
      ? program.getDeclarationDiagnostics(sourceFile)
      : program.getDeclarationDiagnostics();
    
    // 合併並轉換
    const allDiagnostics = [
      ...syntacticDiagnostics,
      ...semanticDiagnostics,
      ...declarationDiagnostics
    ];
    
    return allDiagnostics.map(diag => this.convertDiagnostic(diag));
  }
  
  // 轉換診斷資訊
  private convertDiagnostic(diagnostic: ts.Diagnostic): Diagnostic {
    const { line, character } = diagnostic.file
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)
      : { line: 0, character: 0 };
    
    return {
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      category: this.mapCategory(diagnostic.category),
      file: diagnostic.file?.fileName,
      start: diagnostic.start,
      length: diagnostic.length,
      line: line + 1,
      column: character + 1,
      source: 'typescript'
    };
  }
  
  private mapCategory(category: ts.DiagnosticCategory): 'error' | 'warning' | 'info' | 'hint' {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return 'error';
      case ts.DiagnosticCategory.Warning:
        return 'warning';
      case ts.DiagnosticCategory.Message:
        return 'info';
      case ts.DiagnosticCategory.Suggestion:
        return 'hint';
    }
  }
}
```

## 效能優化

### SourceFile 快取
```typescript
class SourceFileCache {
  private cache = new Map<string, CachedSourceFile>();
  private maxSize = 100;
  
  interface CachedSourceFile {
    sourceFile: ts.SourceFile;
    version: string;
    ast: UnifiedAST;
    timestamp: number;
  }
  
  // 快取 SourceFile
  set(fileName: string, sourceFile: ts.SourceFile, ast: UnifiedAST): void {
    // LRU 淘汰
    if (this.cache.size >= this.maxSize) {
      const oldest = this.findOldest();
      this.cache.delete(oldest);
    }
    
    this.cache.set(fileName, {
      sourceFile,
      version: this.getFileVersion(fileName),
      ast,
      timestamp: Date.now()
    });
  }
  
  // 取得快取的 SourceFile
  get(fileName: string): CachedSourceFile | null {
    const cached = this.cache.get(fileName);
    
    if (!cached) {
      return null;
    }
    
    // 檢查版本
    if (cached.version !== this.getFileVersion(fileName)) {
      this.cache.delete(fileName);
      return null;
    }
    
    // 更新時間戳
    cached.timestamp = Date.now();
    
    return cached;
  }
}
```

## 開發檢查清單

### 功能完整性
- [ ] TypeScript Compiler API 完整整合
- [ ] 所有 TypeScript 語法支援
- [ ] 類型系統完整保留
- [ ] JSX/TSX 正確處理
- [ ] 裝飾器完整解析
- [ ] 診斷資訊準確

### 效能指標
- [ ] 單檔案解析 < 50ms
- [ ] 增量更新 < 20ms
- [ ] 記憶體使用 < 100MB
- [ ] Program 重用率 > 80%

## 疑難排解

### 常見問題

1. **類型資訊遺失**
   - 確保 TypeChecker 初始化
   - 檢查 tsconfig.json 設定
   - 確認 lib 檔案載入

2. **記憶體洩漏**
   - 定期清理 Program 實例
   - 限制 SourceFile 快取大小
   - 使用 WeakMap 存儲節點關聯

3. **增量編譯失敗**
   - 檢查檔案版本追蹤
   - 確保 Watch 模式正確設定
   - 驗證變更檢測邏輯

## 未來改進
1. Language Service 完整功能
2. 自動類型推導優化
3. 專案級別類型快取
4. 與 tsserver 整合