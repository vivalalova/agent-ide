# MCP 介面模組開發規範

## 模組職責
實作 Model Context Protocol (MCP) 介面，讓 AI Agent 能夠透過標準化協定與系統互動，提供工具呼叫、資源存取和提示機制。

## 開發原則

### 1. 協定符合性
- **完全遵循 MCP 規範**：嚴格實作協定要求
- **版本相容**：支援協定版本協商
- **標準錯誤處理**：使用 JSON-RPC 錯誤碼
- **完整文檔**：所有工具和資源的詳細說明

### 2. 效能優化
- 非同步處理
- 連線池管理
- 請求批次處理
- 結果快取

### 3. 安全性
- 認證授權
- 輸入驗證
- 速率限制
- 資源隔離

## 實作規範

### 檔案結構
```
mcp/
├── index.ts                 # MCP 入口
├── server.ts                # MCP 伺服器
├── protocol/
│   ├── types.ts                # 協定型別定義
│   ├── messages.ts             # 訊息定義
│   ├── errors.ts               # 錯誤定義
│   └── validator.ts            # 協定驗證
├── handlers/
│   ├── tool-handler.ts         # 工具處理器
│   ├── resource-handler.ts     # 資源處理器
│   ├── prompt-handler.ts       # 提示處理器
│   └── completion-handler.ts   # 完成處理器
├── tools/
│   ├── index-tool.ts           # 索引工具
│   ├── rename-tool.ts          # 重命名工具
│   ├── move-tool.ts            # 移動工具
│   ├── search-tool.ts          # 搜尋工具
│   ├── analyze-tool.ts         # 分析工具
│   ├── refactor-tool.ts        # 重構工具
│   └── dependency-tool.ts      # 依賴工具
├── resources/
│   ├── file-resource.ts        # 檔案資源
│   ├── symbol-resource.ts      # 符號資源
│   └── project-resource.ts     # 專案資源
├── transport/
│   ├── stdio-transport.ts      # STDIO 傳輸
│   ├── http-transport.ts       # HTTP 傳輸
│   └── websocket-transport.ts  # WebSocket 傳輸
└── types.ts                 # 型別定義
```

## MCP 伺服器實作

### 主伺服器
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class MCPServer {
  private server: Server;
  private tools: Map<string, Tool> = new Map();
  private resources: Map<string, Resource> = new Map();
  private prompts: Map<string, Prompt> = new Map();
  
  constructor() {
    this.server = new Server(
      {
        name: 'agent-ide-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          completion: {}
        }
      }
    );
    
    this.setupHandlers();
    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }
  
  // 設定處理器
  private setupHandlers(): void {
    // 列出工具
    this.server.setRequestHandler('tools/list', async () => ({
      tools: Array.from(this.tools.values()).map(tool => tool.getSchema())
    }));
    
    // 呼叫工具
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      const tool = this.tools.get(name);
      
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: await tool.execute(args)
          }
        ]
      };
    });
    
    // 列出資源
    this.server.setRequestHandler('resources/list', async () => ({
      resources: Array.from(this.resources.values()).map(r => r.getSchema())
    }));
    
    // 讀取資源
    this.server.setRequestHandler('resources/read', async (request) => {
      const { uri } = request.params;
      const resource = this.findResourceByUri(uri);
      
      if (!resource) {
        throw new Error(`Resource not found: ${uri}`);
      }
      
      return {
        contents: [
          {
            uri,
            mimeType: resource.getMimeType(),
            text: await resource.read()
          }
        ]
      };
    });
    
    // 列出提示
    this.server.setRequestHandler('prompts/list', async () => ({
      prompts: Array.from(this.prompts.values()).map(p => p.getSchema())
    }));
    
    // 取得提示
    this.server.setRequestHandler('prompts/get', async (request) => {
      const { name, arguments: args } = request.params;
      const prompt = this.prompts.get(name);
      
      if (!prompt) {
        throw new Error(`Prompt not found: ${name}`);
      }
      
      return {
        messages: await prompt.generate(args)
      };
    });
    
    // 完成
    this.server.setRequestHandler('completion/complete', async (request) => {
      const { ref, argument } = request.params;
      return {
        completion: {
          values: await this.getCompletions(ref, argument)
        }
      };
    });
  }
  
  // 啟動伺服器
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP server started');
  }
}
```

## 工具實作

### 基礎工具類別
```typescript
abstract class BaseTool implements Tool {
  protected name: string;
  protected description: string;
  protected parameters: ParameterSchema;
  
  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
    this.parameters = this.defineParameters();
  }
  
  // 取得工具 Schema
  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: 'object',
        properties: this.parameters,
        required: this.getRequiredParameters()
      }
    };
  }
  
  // 定義參數
  protected abstract defineParameters(): ParameterSchema;
  
  // 取得必要參數
  protected abstract getRequiredParameters(): string[];
  
  // 執行工具
  abstract execute(args: any): Promise<string>;
  
  // 驗證參數
  protected validateParameters(args: any): void {
    for (const param of this.getRequiredParameters()) {
      if (!(param in args)) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }
  }
}
```

### 搜尋工具
```typescript
class SearchTool extends BaseTool {
  private searchService: SearchService;
  
  constructor() {
    super(
      'search_code',
      'Search for code patterns, symbols, or text across the codebase'
    );
    this.searchService = new SearchService();
  }
  
  protected defineParameters(): ParameterSchema {
    return {
      query: {
        type: 'string',
        description: 'Search query (text, regex, or pattern)'
      },
      type: {
        type: 'string',
        enum: ['text', 'symbol', 'pattern', 'semantic'],
        description: 'Type of search'
      },
      scope: {
        type: 'string',
        description: 'Limit search to specific path or scope'
      },
      language: {
        type: 'string',
        enum: ['typescript', 'javascript', 'swift'],
        description: 'Filter by language'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results',
        default: 50
      },
      includeContext: {
        type: 'boolean',
        description: 'Include surrounding context',
        default: true
      }
    };
  }
  
  protected getRequiredParameters(): string[] {
    return ['query'];
  }
  
  async execute(args: SearchArgs): Promise<string> {
    this.validateParameters(args);
    
    const results = await this.searchService.search({
      query: args.query,
      type: args.type || 'text',
      scope: args.scope,
      language: args.language,
      limit: args.maxResults || 50
    });
    
    // 格式化結果為最小 token 使用
    return this.formatResults(results, args.includeContext);
  }
  
  private formatResults(results: SearchResult[], includeContext: boolean): string {
    if (results.length === 0) {
      return 'No results found';
    }
    
    const formatted = results.map(result => {
      const base = `${result.file}:${result.line}:${result.column}`;
      
      if (includeContext) {
        return `${base}\n${result.preview}`;
      }
      
      return `${base}: ${result.match}`;
    });
    
    return formatted.join('\n\n');
  }
}
```

### 重命名工具
```typescript
class RenameTool extends BaseTool {
  private renameService: RenameService;
  
  constructor() {
    super(
      'rename_symbol',
      'Rename a symbol across the codebase with reference updates'
    );
    this.renameService = new RenameService();
  }
  
  protected defineParameters(): ParameterSchema {
    return {
      oldName: {
        type: 'string',
        description: 'Current name of the symbol'
      },
      newName: {
        type: 'string',
        description: 'New name for the symbol'
      },
      file: {
        type: 'string',
        description: 'File containing the symbol (optional for disambiguation)'
      },
      line: {
        type: 'number',
        description: 'Line number of the symbol (optional for disambiguation)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview changes without applying',
        default: false
      }
    };
  }
  
  protected getRequiredParameters(): string[] {
    return ['oldName', 'newName'];
  }
  
  async execute(args: RenameArgs): Promise<string> {
    this.validateParameters(args);
    
    // 找出符號
    const symbol = await this.renameService.findSymbol(
      args.oldName,
      args.file ? { file: args.file, line: args.line } : undefined
    );
    
    if (!symbol) {
      return `Symbol '${args.oldName}' not found`;
    }
    
    // 分析影響
    const impact = await this.renameService.analyzeImpact(symbol, args.newName);
    
    if (args.dryRun) {
      return this.formatDryRunResult(impact);
    }
    
    // 執行重命名
    const result = await this.renameService.rename(symbol, args.newName);
    
    return this.formatRenameResult(result);
  }
  
  private formatDryRunResult(impact: RenameImpact): string {
    return [
      `Would rename ${impact.occurrences} occurrences across ${impact.files.length} files:`,
      ...impact.files.map(f => `  - ${f}`),
      '',
      'Changes preview:',
      ...impact.changes.slice(0, 5).map(c => 
        `  ${c.file}:${c.line}: ${c.before} → ${c.after}`
      ),
      impact.changes.length > 5 ? `  ... and ${impact.changes.length - 5} more` : ''
    ].filter(Boolean).join('\n');
  }
}
```

## 資源實作

### 基礎資源類別
```typescript
abstract class BaseResource implements Resource {
  protected uri: string;
  protected name: string;
  protected description: string;
  protected mimeType: string;
  
  constructor(uri: string, name: string, description: string) {
    this.uri = uri;
    this.name = name;
    this.description = description;
    this.mimeType = this.determineMimeType();
  }
  
  // 取得資源 Schema
  getSchema(): ResourceSchema {
    return {
      uri: this.uri,
      name: this.name,
      description: this.description,
      mimeType: this.mimeType
    };
  }
  
  // 取得 MIME 類型
  getMimeType(): string {
    return this.mimeType;
  }
  
  // 決定 MIME 類型
  protected abstract determineMimeType(): string;
  
  // 讀取資源
  abstract read(): Promise<string>;
  
  // 監視變更
  abstract subscribe(callback: (change: ResourceChange) => void): () => void;
}
```

### 檔案資源
```typescript
class FileResource extends BaseResource {
  private filePath: string;
  private watcher: FSWatcher | null = null;
  
  constructor(filePath: string) {
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;
    const name = path.basename(filePath);
    const description = `File: ${filePath}`;
    
    super(uri, name, description);
    this.filePath = filePath;
  }
  
  protected determineMimeType(): string {
    const ext = path.extname(this.filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.ts': 'text/x-typescript',
      '.tsx': 'text/x-typescript',
      '.js': 'text/javascript',
      '.jsx': 'text/javascript',
      '.swift': 'text/x-swift',
      '.json': 'application/json',
      '.md': 'text/markdown'
    };
    
    return mimeTypes[ext] || 'text/plain';
  }
  
  async read(): Promise<string> {
    try {
      return await fs.readFile(this.filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
  
  subscribe(callback: (change: ResourceChange) => void): () => void {
    this.watcher = fs.watch(this.filePath, (eventType) => {
      callback({
        uri: this.uri,
        type: eventType === 'rename' ? 'deleted' : 'updated'
      });
    });
    
    return () => {
      this.watcher?.close();
      this.watcher = null;
    };
  }
}
```

### 符號資源
```typescript
class SymbolResource extends BaseResource {
  private symbol: Symbol;
  private indexService: IndexingService;
  
  constructor(symbol: Symbol) {
    const uri = `symbol:///${symbol.qualifiedName}`;
    const name = symbol.name;
    const description = `${symbol.kind}: ${symbol.qualifiedName}`;
    
    super(uri, name, description);
    this.symbol = symbol;
    this.indexService = new IndexingService();
  }
  
  protected determineMimeType(): string {
    return 'application/vnd.agent-ide.symbol+json';
  }
  
  async read(): Promise<string> {
    // 取得符號詳細資訊
    const details = await this.indexService.getSymbolDetails(this.symbol);
    
    return JSON.stringify({
      symbol: this.symbol,
      definition: details.definition,
      references: details.references,
      documentation: details.documentation,
      type: details.type,
      modifiers: details.modifiers
    }, null, 2);
  }
  
  subscribe(callback: (change: ResourceChange) => void): () => void {
    // 監視符號變更
    return this.indexService.watchSymbol(this.symbol, (change) => {
      callback({
        uri: this.uri,
        type: change.type
      });
    });
  }
}
```

## 提示實作

### 基礎提示類別
```typescript
abstract class BasePrompt implements Prompt {
  protected name: string;
  protected description: string;
  protected arguments: ArgumentSchema;
  
  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
    this.arguments = this.defineArguments();
  }
  
  // 取得提示 Schema
  getSchema(): PromptSchema {
    return {
      name: this.name,
      description: this.description,
      arguments: this.arguments
    };
  }
  
  // 定義參數
  protected abstract defineArguments(): ArgumentSchema;
  
  // 產生提示
  abstract generate(args: any): Promise<PromptMessage[]>;
}
```

### 重構提示
```typescript
class RefactorPrompt extends BasePrompt {
  constructor() {
    super(
      'refactor_code',
      'Generate a refactoring plan for improving code quality'
    );
  }
  
  protected defineArguments(): ArgumentSchema {
    return [
      {
        name: 'file',
        description: 'File to refactor',
        required: true
      },
      {
        name: 'type',
        description: 'Type of refactoring',
        required: false
      }
    ];
  }
  
  async generate(args: RefactorArgs): Promise<PromptMessage[]> {
    const fileContent = await this.readFile(args.file);
    const analysis = await this.analyzeCode(args.file);
    
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: this.buildRefactorPrompt(fileContent, analysis, args.type)
        }
      }
    ];
  }
  
  private buildRefactorPrompt(
    code: string,
    analysis: CodeAnalysis,
    type?: string
  ): string {
    const sections = [
      '# Code Refactoring Request',
      '',
      '## Current Code',
      '```' + analysis.language,
      code,
      '```',
      '',
      '## Code Analysis',
      `- Complexity: ${analysis.complexity}`,
      `- Code smells: ${analysis.smells.join(', ')}`,
      `- Potential issues: ${analysis.issues.join(', ')}`,
      ''
    ];
    
    if (type) {
      sections.push(
        '## Requested Refactoring Type',
        type,
        ''
      );
    }
    
    sections.push(
      '## Task',
      'Please suggest refactoring improvements for this code.',
      'Focus on:',
      '1. Reducing complexity',
      '2. Improving readability',
      '3. Following best practices',
      '4. Eliminating code smells'
    );
    
    return sections.join('\n');
  }
}
```

## 完成處理

### 完成提供器
```typescript
class CompletionProvider {
  private completionSources: Map<string, CompletionSource> = new Map();
  
  constructor() {
    this.registerSources();
  }
  
  // 註冊完成來源
  private registerSources(): void {
    this.completionSources.set('file', new FileCompletionSource());
    this.completionSources.set('symbol', new SymbolCompletionSource());
    this.completionSources.set('command', new CommandCompletionSource());
  }
  
  // 取得完成建議
  async getCompletions(ref: CompletionRef, argument: string): Promise<string[]> {
    const source = this.completionSources.get(ref.name);
    
    if (!source) {
      return [];
    }
    
    return source.complete(argument, ref.context);
  }
}

// 檔案完成來源
class FileCompletionSource implements CompletionSource {
  async complete(partial: string, context?: any): Promise<string[]> {
    const dir = path.dirname(partial);
    const prefix = path.basename(partial);
    
    try {
      const files = await fs.readdir(dir);
      return files
        .filter(f => f.startsWith(prefix))
        .map(f => path.join(dir, f));
    } catch {
      return [];
    }
  }
}

// 符號完成來源
class SymbolCompletionSource implements CompletionSource {
  private indexService = new IndexingService();
  
  async complete(partial: string, context?: any): Promise<string[]> {
    const symbols = await this.indexService.searchSymbols(partial);
    
    return symbols
      .slice(0, 20)
      .map(s => s.qualifiedName);
  }
}
```

## 傳輸層

### STDIO 傳輸
```typescript
class StdioTransport implements Transport {
  private messageHandler: (message: any) => void;
  
  start(handler: (message: any) => void): void {
    this.messageHandler = handler;
    
    process.stdin.on('data', (data) => {
      const lines = data.toString().split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.messageHandler(message);
          } catch (error) {
            console.error('Invalid message:', error);
          }
        }
      }
    });
  }
  
  send(message: any): void {
    const json = JSON.stringify(message);
    process.stdout.write(json + '\n');
  }
  
  close(): void {
    process.stdin.pause();
  }
}
```

## 錯誤處理

### MCP 錯誤處理
```typescript
class MCPErrorHandler {
  // 處理錯誤
  handleError(error: any): MCPError {
    if (error instanceof MCPError) {
      return error;
    }
    
    if (error instanceof ValidationError) {
      return new MCPError(
        -32602, // Invalid params
        error.message,
        { field: error.field }
      );
    }
    
    if (error instanceof NotFoundError) {
      return new MCPError(
        -32601, // Method not found
        error.message
      );
    }
    
    // 內部錯誤
    return new MCPError(
      -32603, // Internal error
      'Internal server error',
      process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined
    );
  }
}

// MCP 錯誤類別
class MCPError extends Error {
  code: number;
  data?: any;
  
  constructor(code: number, message: string, data?: any) {
    super(message);
    this.code = code;
    this.data = data;
  }
  
  toJSON(): any {
    return {
      code: this.code,
      message: this.message,
      data: this.data
    };
  }
}
```

## 效能監控

### 效能追蹤
```typescript
class PerformanceTracker {
  private metrics: Map<string, Metric[]> = new Map();
  
  // 記錄工具呼叫
  trackToolCall(tool: string, duration: number, success: boolean): void {
    this.addMetric('tool_calls', {
      tool,
      duration,
      success,
      timestamp: Date.now()
    });
  }
  
  // 記錄資源存取
  trackResourceAccess(resource: string, duration: number, size: number): void {
    this.addMetric('resource_access', {
      resource,
      duration,
      size,
      timestamp: Date.now()
    });
  }
  
  // 產生報告
  generateReport(): PerformanceReport {
    return {
      toolCalls: this.aggregateToolMetrics(),
      resourceAccess: this.aggregateResourceMetrics(),
      summary: {
        totalCalls: this.getTotalCalls(),
        averageDuration: this.getAverageDuration(),
        errorRate: this.getErrorRate()
      }
    };
  }
}
```

## 開發檢查清單

### 協定實作
- [ ] 完整 MCP 協定支援
- [ ] 所有必要的處理器
- [ ] 正確的錯誤處理
- [ ] 協定版本協商

### 工具與資源
- [ ] 所有核心功能工具
- [ ] 資源監視機制
- [ ] 提示產生器
- [ ] 完成提供器

### 效能與安全
- [ ] 非同步處理
- [ ] 速率限制
- [ ] 輸入驗證
- [ ] 資源隔離

## 疑難排解

### 常見問題

1. **連線失敗**
   - 檢查傳輸設定
   - 驗證協定版本
   - 查看錯誤日誌

2. **工具呼叫失敗**
   - 檢查參數驗證
   - 確認權限設定
   - 驗證服務狀態

3. **效能問題**
   - 啟用結果快取
   - 使用批次處理
   - 優化查詢條件

## 未來改進
1. 支援更多傳輸協定
2. 增加認證機制
3. 工具組合支援
4. 事件推送機制